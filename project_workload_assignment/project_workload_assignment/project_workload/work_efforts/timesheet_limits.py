# Copyright (c) 2026, Dinext
"""Port of Server Script «Calculate Timesheet Limits_V4».

ISS-2025-01239: миграция из Server Script в Python-модуль.
API method: calculate_timesheet_limits

Performance: bulk-load all Task / PWE / PWEA data upfront per project
to avoid N+1 DB queries in the recursive helpers.
"""

from __future__ import annotations

import json

import frappe

from project_workload_assignment.project_workload_assignment.project_workload.work_efforts.models import (
    HoursData,
    LimitStatus,
    PlanData,
    TimesheetLimitsFormInput,
    TimesheetLimitsResponse,
    TimesheetPositionInput,
)


def _parse_limit_rows(rows: list[dict]) -> dict[str, float | None]:
    def parse(typ: str) -> float | None:
        for row in rows:
            row_type = (row.get("type") or "").strip().lower()
            if row_type == typ:
                limit = row.get("limit")
                if isinstance(limit, (int, float)):
                    return float(limit)
                if limit and str(limit).replace(".", "", 1).isdigit():
                    return float(limit)
        return None

    return {
        "block": parse("блокировка"),
        "warning": parse("предупреждение") or 100,
        "message": parse("уведомление"),
    }


def _bulk_load(
    positions: list[TimesheetPositionInput],
) -> tuple[dict, dict, dict, dict, dict]:
    """Return (task_meta, children_map, pwe_by_task_role, pwe_amounts, limit_rows).

    task_meta      : {task_name: {"subject", "parent_task", "custom_linked_issue"}}
    children_map   : {(project, task_name): [child_name, ...]}  (direct children)
    pwe_by_task_role: {(project, task, role): [pwe_name, ...]}
    pwe_amounts    : {pwe_name: [{year, month, plan}]}
    limit_rows     : {project: [{type, limit}]}
    """
    unique_projects: set[str] = set()
    for pos in positions or []:
        if pos.get("project"):
            unique_projects.add(pos["project"])

    task_meta: dict = {}
    children_map: dict = {}

    if unique_projects:
        project_list = list(unique_projects)

        # 1) All tasks in these projects
        raw_tasks = frappe.db.get_all(
            "Task",
            filters={"project": ["in", project_list]},
            fields=["name", "parent_task", "subject", "custom_linked_issue", "project"],
        )
        for t in raw_tasks:
            task_meta[t.name] = {
                "subject": t.subject or t.name,
                "parent_task": t.parent_task or None,
                "custom_linked_issue": bool(t.custom_linked_issue),
            }
            proj = t.project or ""
            children_map.setdefault((proj, t.name), [])
            if t.parent_task:
                children_map.setdefault((proj, t.parent_task), [])
                children_map[(proj, t.parent_task)].append(t.name)

        # 2) All Project Work Efforts + amounts
        all_pwe = frappe.db.get_all(
            "Project Work Efforts",
            filters={"pwe_project": ["in", project_list]},
            fields=["name", "pwe_project", "pwe_task", "pwe_project_role"],
        )
        pwe_by_task_role: dict = {}
        pwe_names = []
        for p in all_pwe:
            key = (p.pwe_project, p.pwe_task, p.pwe_project_role)
            pwe_by_task_role.setdefault(key, []).append(p.name)
            pwe_names.append(p.name)

        pwe_amounts: dict = {}
        if pwe_names:
            raw_amounts = frappe.db.get_all(
                "Project Work Efforts Amount",
                filters={"parent": ["in", pwe_names]},
                fields=["parent", "pwea_year", "pwea_month", "pwea_plan"],
            )
            for a in raw_amounts:
                pwe_amounts.setdefault(a.parent, []).append(
                    {"year": int(a.pwea_year), "month": int(a.pwea_month), "plan": frappe.utils.flt(a.pwea_plan or 0)}
                )

        # 3) Limit Control rows for all projects
        limit_rows: dict = {}
        raw_limits = frappe.db.get_all(
            "Limit Control",
            filters={"parent": ["in", project_list], "parenttype": "Project"},
            fields=["parent", "type", "limit"],
        )
        for r in raw_limits:
            limit_rows.setdefault(r.parent, []).append({"type": r.type, "limit": r.limit})
    else:
        pwe_by_task_role = {}
        pwe_amounts = {}
        limit_rows = {}

    return task_meta, children_map, pwe_by_task_role, pwe_amounts, limit_rows


def run_calculate_timesheet_limits(
    form_dict: TimesheetLimitsFormInput,
) -> TimesheetLimitsResponse:
    positions: list[TimesheetPositionInput] = json.loads(form_dict["positions"])
    timesheet_name = form_dict.get("timesheet_name")

    session_limits_override: dict[str, float | None] | None = None
    if form_dict.get("project_limits"):
        session_limits_override = _parse_limit_rows(
            json.loads(form_dict["project_limits"])
        )

    # ── Bulk-load all DB data upfront ────────────────────────────────────────
    task_meta, children_map, pwe_by_task_role, pwe_amounts, limit_rows_by_project = (
        _bulk_load(positions)
    )

    cache: dict[str, dict] = {
        "plan_data": {},
        "total_hours": {},
        "project_settings": {},
        "root_task_with_issue": {},
        "all_children": {},
    }

    # ── Helpers (now use pre-loaded data, no DB calls) ────────────────────────

    def _get_all_children_recursive(project: str, task: str) -> list[str]:
        """Return all descendant task names (depth-first, project-scoped)."""
        result: list[str] = []
        for child in children_map.get((project, task), []):
            result.append(child)
            result.extend(_get_all_children_recursive(project, child))
        return result

    def get_all_children(project: str, task: str) -> list[str]:
        ck = project + task
        if ck not in cache["all_children"]:
            cache["all_children"][ck] = _get_all_children_recursive(project, task)
        return cache["all_children"][ck]

    def has_children(project: str, task: str) -> bool:
        return bool(children_map.get((project, task)))

    def has_linked_issue(task_name: str) -> bool:
        return task_meta.get(task_name, {}).get("custom_linked_issue", False)

    def find_root_task_with_linked_issue(project: str, task: str) -> str | None:
        ck = project + task
        if ck in cache["root_task_with_issue"]:
            return cache["root_task_with_issue"][ck]
        current = task
        while current:
            if has_linked_issue(current):
                cache["root_task_with_issue"][ck] = current
                return current
            current = task_meta.get(current, {}).get("parent_task")
        cache["root_task_with_issue"][ck] = None
        return None

    def _pwe_planned(pwe_name: str, year: int, month: int) -> float:
        return sum(
            a["plan"]
            for a in pwe_amounts.get(pwe_name, [])
            if a["year"] == year and a["month"] == month
        )

    def find_task_with_plan(
        project: str,
        task: str,
        role: str,
        year: int | None = None,
        month: int | None = None,
    ) -> PlanData | None:
        requirement = cache["project_settings"].get(project, "Опционально")
        root_task_with_issue = None
        can_go_above_root_issue = False

        if requirement == "Обязательно для всех Запросов":
            root_task_with_issue = find_root_task_with_linked_issue(project, task)
            if not root_task_with_issue:
                can_go_above_root_issue = True

        if year is None and month is None:
            cache_key = project + task + role
            if cache_key in cache["plan_data"]:
                return cache["plan_data"][cache_key]

            # Find all unique (year, month) pairs for this project's PWE
            pwe_keys = [k for k in pwe_by_task_role if k[0] == project]
            period_set: set[tuple[int, int]] = set()
            for key in pwe_keys:
                for pwe_name in pwe_by_task_role[key]:
                    for a in pwe_amounts.get(pwe_name, []):
                        period_set.add((a["year"], a["month"]))

            total_planned = 0.0
            for yr, mo in period_set:
                result = find_task_with_plan(project, task, role, yr, mo)
                if result:
                    total_planned += result["planned_hours"]

            if total_planned > 0:
                subj = task_meta.get(task, {}).get("subject", task)
                plan_data: PlanData = {
                    "task_name": task,
                    "planned_hours": total_planned,
                    "subject": subj,
                }
                cache["plan_data"][cache_key] = plan_data
                return plan_data
            return None

        def get_plan_for_task(
            t: str, visited: set[str] | None = None
        ) -> tuple[float, PlanData | None]:
            if visited is None:
                visited = set()
            if t in visited:
                return [0.0, None]
            visited.add(t)

            ck = project + t + role + f"_{year}_{month}"
            if ck in cache["plan_data"]:
                return [cache["plan_data"][ck]["planned_hours"], cache["plan_data"][ck]]

            pwe_list = pwe_by_task_role.get((project, t, role), [])
            if pwe_list:
                planned = sum(_pwe_planned(pwe, year, month) for pwe in pwe_list)
                if planned > 0:
                    subj = task_meta.get(t, {}).get("subject", t)
                    plan_data: PlanData = {
                        "task_name": t,
                        "planned_hours": planned,
                        "subject": subj,
                    }
                    cache["plan_data"][ck] = plan_data
                    return [planned, plan_data]

            direct_children = children_map.get((project, t), [])
            if direct_children:
                total_plan = 0.0
                found_any = False
                for child in direct_children:
                    child_plan, _ = get_plan_for_task(child, visited.copy())
                    if child_plan > 0:
                        total_plan += child_plan
                        found_any = True
                if found_any:
                    plan_data: PlanData = {
                        "task_name": t,
                        "planned_hours": total_plan,
                        "subject": task_meta.get(t, {}).get("subject", t),
                    }
                    cache["plan_data"][ck] = plan_data
                    return [total_plan, plan_data]

            parent = task_meta.get(t, {}).get("parent_task")
            if parent:
                if (
                    requirement == "Обязательно для всех Запросов"
                    and root_task_with_issue
                    and t == root_task_with_issue
                    and not can_go_above_root_issue
                ):
                    return [0.0, None]
                parent_plan, parent_data = get_plan_for_task(parent, visited.copy())
                if parent_plan > 0 and parent_data:
                    plan_data: PlanData = {
                        "task_name": parent_data["task_name"],
                        "planned_hours": parent_plan,
                        "subject": parent_data["subject"],
                    }
                    cache["plan_data"][ck] = plan_data
                    return [parent_plan, plan_data]

            return [0.0, None]

        result = get_plan_for_task(task)
        planned = result[0]
        plan_data = result[1]

        if planned > 0 and plan_data:
            ck = project + task + role + f"_{year}_{month}"
            cache["plan_data"][ck] = plan_data
            return plan_data
        return None

    def get_project_limits(project: str) -> dict[str, float | None]:
        if session_limits_override is not None:
            return session_limits_override
        rows = limit_rows_by_project.get(project, [])
        return _parse_limit_rows(rows)

    def aggregate_hours(
        plan_task: str,
        tasks: list[str],
        role: str,
        timesheet_name: str | None,
        timesheet_status: str | None,
        local_positions: list[TimesheetPositionInput],
        year: int | None = None,
        month: int | None = None,
    ) -> HoursData:
        ck = plan_task + role
        if year is not None:
            ck += f"_{year}_{month}"
        if ck in cache["total_hours"]:
            return cache["total_hours"][ck]

        if year is not None and month is not None:
            total: HoursData = {"total": 0}
            users: set[str] = set()
            for pos in local_positions:
                pos_task = pos.get("document_name")
                pos_role = pos.get("project_role", "")
                pos_year = pos.get("year")
                pos_month = pos.get("month")
                if (
                    pos_task == plan_task
                    and pos_role == role
                    and pos_year == year
                    and pos_month == month
                ):
                    hrs = frappe.utils.flt(pos.get("all_hours", 0))
                    total["total"] = total.get("total", 0) + hrs
                    total[pos.get("status", "")] = total.get(pos.get("status", ""), 0) + hrs
                    users.add(pos.get("custom_username", ""))
            total["users"] = users
            cache["total_hours"][ck] = total
            return total

        filters: dict[str, object] = {"document_name": ["in", tasks], "project_role": role}
        if timesheet_name:
            filters["user_timesheet"] = ["!=", timesheet_name]

        db_rows = frappe.db.get_all(
            "User Timesheet Position",
            filters=filters,
            fields=["all_hours", "status", "document_name", "custom_username"],
        )

        total: HoursData = {}
        users: set[str] = set()
        for r in db_rows:
            hrs = frappe.utils.flt(r.all_hours or 0.0)
            total["total"] = total.get("total", 0.0) + hrs
            total[r.status] = total.get(r.status, 0.0) + hrs
            users.add(r.custom_username)

        if timesheet_name and timesheet_status:
            for pos in local_positions:
                task = pos.get("document_name")
                task_role = pos.get("project_role", "")
                local_hours = pos.get("all_hours")
                users.add(pos.get("custom_username"))
                if task in tasks and role == task_role and local_hours:
                    hrs = frappe.utils.flt(local_hours)
                    total["total"] = total.get("total", 0.0) + hrs
                    total[timesheet_status] = total.get(timesheet_status, 0.0) + hrs

        total["users"] = users
        cache["total_hours"][ck] = total
        return total

    def get_project_roles(project: str) -> set[str]:
        roles: set[str] = set()
        project_roles = frappe.db.get_all(
            "Project Team Details",
            filters={"parent": project},
            fields=["pt_role"],
        )
        for pr in project_roles:
            roles.add(pr.pt_role)
        return roles

    def is_plan_required(position: TimesheetPositionInput) -> bool:
        project = position.get("project")
        task_name = position.get("document_name")
        if not project or not task_name:
            return False
        if project not in cache["project_settings"]:
            requirement = frappe.db.get_value(
                "Project", project, "custom_обязательность_плановых_трудозатрат"
            )
            cache["project_settings"][project] = requirement or "Опционально"
        requirement = cache["project_settings"][project]
        if requirement == "Опционально":
            return False
        if requirement == "Обязательно для всех Задач":
            return True
        if requirement == "Обязательно для всех Запросов":
            return find_root_task_with_linked_issue(project, task_name) is not None
        return False

    results: TimesheetLimitsResponse = []

    for pos in positions or []:
        utp = pos.get("name")
        doc = pos.get("document_name")
        role = pos.get("project_role", "")
        proj = pos.get("project")
        status = pos.get("status")
        year = pos.get("year")
        month = pos.get("month")

        if not doc:
            continue

        plan_required = is_plan_required(pos)

        project_roles: list[str] = []
        if role:
            project_roles.append(role)
        else:
            project_roles = list(get_project_roles(proj))

        doc_subject = task_meta.get(doc, {}).get("subject", doc)

        for project_role in project_roles:
            plan = find_task_with_plan(proj, doc, project_role, year, month)

            used_parent = False
            task_for_fact: list[str] = [doc]
            task_for_plan = doc

            if plan:
                if plan["task_name"] != doc:
                    used_parent = True
                    task_for_plan = plan["task_name"]
                task_for_fact = [plan["task_name"]] + get_all_children(proj, task_for_plan)
            else:
                if has_children(proj, task_for_plan):
                    task_for_fact = task_for_fact + get_all_children(proj, task_for_plan)

            total_hours = aggregate_hours(
                task_for_plan,
                task_for_fact,
                project_role,
                timesheet_name,
                status,
                positions,
                year,
                month,
            )

            planned = plan["planned_hours"] if plan else 0.0
            pct = 0
            if planned > 0:
                pct = int((total_hours.get("total", 0) / planned) * 100)

            limits = get_project_limits(proj or "")
            limit_status: LimitStatus = "no-plan"
            limit = 0

            if plan_required and planned == 0:
                limit_status = "block"
            elif planned > 0:
                if limits.get("block") and pct > limits["block"]:
                    limit_status = "block"
                    limit = limits["block"]
                elif limits.get("warning") and pct > limits["warning"]:
                    limit_status = "warning"
                    limit = limits["warning"]
                elif limits.get("message") and pct > limits["message"]:
                    limit_status = "message"
                    limit = limits["message"]
                else:
                    limit_status = "normal"

            plan_task_subject = (plan or {}).get("subject") or doc_subject

            results.append(
                {
                    "project": proj,
                    "position": utp,
                    "document_name": doc,
                    "role": project_role,
                    "planned_hours": planned,
                    "total_hours": total_hours.get("total", 0),
                    "hours_data": total_hours,
                    "completion_percentage": pct,
                    "status": limit_status,
                    "limit": limit,
                    "used_parent_for_plan": used_parent,
                    "used_children_for_actual": len(task_for_fact) > 1,
                    "child_tasks_count": max(len(task_for_fact) - 1, 0),
                    "task_subject": doc_subject,
                    "plan_required": plan_required,
                    "plan_task_subject": plan_task_subject,
                    "has_linked_issue": has_linked_issue(doc)
                    if cache["project_settings"].get(proj) == "Обязательно для всех Запросов"
                    else None,
                    "root_task_with_issue": find_root_task_with_linked_issue(proj, doc)
                    if cache["project_settings"].get(proj) == "Обязательно для всех Запросов"
                    else None,
                }
            )

    return results
