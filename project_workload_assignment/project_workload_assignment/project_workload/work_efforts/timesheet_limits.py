# Copyright (c) 2026, Dinext
"""Port of Server Script «Calculate Timesheet Limits_V4».

ISS-2025-01239: миграция из Server Script в Python-модуль.
API method: calculate_timesheet_limits
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

    cache: dict[str, dict] = {
        "has_children": {},
        "all_children": {},
        "plan_data": {},
        "limits": {},
        "total_hours": {},
        "roles": {},
        "project_settings": {},
        "task_linked_issues": {},
        "root_task_with_issue": {},
    }

    def has_children(project: str, task: str) -> bool:
        if not task:
            return False
        cache_key = project + task
        if cache_key in cache["has_children"]:
            return cache["has_children"][cache_key]
        children = frappe.db.get_all(
            "Task", filters={"parent_task": task, "project": project}, limit=1
        )
        cache["has_children"][cache_key] = bool(children)
        return cache["has_children"][cache_key]

    def get_all_children(project: str, task: str) -> list[str]:
        cache_key = project + task
        if cache_key in cache["all_children"]:
            return cache["all_children"][cache_key]
        result: list[str] = []
        direct = frappe.db.get_all(
            "Task",
            filters={"parent_task": task, "project": project},
            fields=["name"],
        )
        for row in direct:
            result.append(row.name)
            result = result + get_all_children(project, row.name)
        cache["all_children"][cache_key] = result
        return result

    def has_linked_issue(task_name: str) -> bool:
        if task_name not in cache["task_linked_issues"]:
            linked_issue = frappe.db.get_value("Task", task_name, "custom_linked_issue")
            cache["task_linked_issues"][task_name] = bool(linked_issue)
        return cache["task_linked_issues"][task_name]

    def find_root_task_with_linked_issue(project: str, task: str) -> str | None:
        cache_key = project + task
        if cache_key in cache["root_task_with_issue"]:
            return cache["root_task_with_issue"][cache_key]
        current_task = task
        while current_task:
            if has_linked_issue(current_task):
                cache["root_task_with_issue"][cache_key] = current_task
                return current_task
            current_task = frappe.db.get_value("Task", current_task, "parent_task")
        cache["root_task_with_issue"][cache_key] = None
        return None

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

            all_pwe = frappe.db.get_all(
                "Project Work Efforts",
                filters={"pwe_project": project},
                fields=["name"],
            )
            pwe_names = [p["name"] for p in all_pwe]

            periods: list[dict] = []
            if pwe_names:
                periods = frappe.db.get_all(
                    "Project Work Efforts Amount",
                    filters={"parent": ["in", pwe_names]},
                    fields=["pwea_year", "pwea_month"],
                    group_by="pwea_year, pwea_month",
                )

            total_planned = 0.0
            for p in periods:
                result = find_task_with_plan(
                    project, task, role, int(p.pwea_year), int(p.pwea_month)
                )
                if result:
                    total_planned += result["planned_hours"]

            if total_planned > 0:
                subj = frappe.db.get_value("Task", task, "subject") or task
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

            pwe = frappe.db.get_all(
                "Project Work Efforts",
                filters={
                    "pwe_task": t,
                    "pwe_project": project,
                    "pwe_project_role": role,
                },
                fields=["name"],
            )

            if pwe:
                doc = frappe.get_doc("Project Work Efforts", pwe[0].name)
                planned = sum(
                    (
                        frappe.utils.flt(r.pwea_plan or 0)
                        for r in doc.pwe_amount
                        if int(r.pwea_year) == year and int(r.pwea_month) == month
                    ),
                    0.0,
                )
                if planned > 0:
                    subj = frappe.db.get_value("Task", t, "subject") or t
                    plan_data: PlanData = {
                        "task_name": t,
                        "planned_hours": planned,
                        "subject": subj,
                    }
                    cache["plan_data"][ck] = plan_data
                    return [planned, plan_data]

            children = frappe.db.get_all(
                "Task",
                filters={"parent_task": t, "project": project},
                fields=["name"],
            )
            if children:
                total_plan = 0.0
                found_any = False
                for child in children:
                    child_result = get_plan_for_task(child.name, visited.copy())
                    child_plan = child_result[0]
                    if child_plan > 0:
                        total_plan += child_plan
                        found_any = True
                if found_any:
                    plan_data: PlanData = {
                        "task_name": t,
                        "planned_hours": total_plan,
                        "subject": frappe.db.get_value("Task", t, "subject") or t,
                    }
                    cache["plan_data"][ck] = plan_data
                    return [total_plan, plan_data]

            parent = frappe.db.get_value("Task", t, "parent_task")
            if parent:
                if (
                    requirement == "Обязательно для всех Запросов"
                    and root_task_with_issue
                    and t == root_task_with_issue
                    and not can_go_above_root_issue
                ):
                    return [0.0, None]
                parent_result = get_plan_for_task(parent, visited.copy())
                parent_plan = parent_result[0]
                parent_data = parent_result[1]
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

        if project in cache["limits"]:
            return cache["limits"][project]

        rows = frappe.db.get_all(
            "Limit Control",
            filters={"parent": project, "parenttype": "Project"},
            fields=["type", "limit"],
        )
        limits = _parse_limit_rows(rows)
        cache["limits"][project] = limits
        return limits

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
        if project in cache["roles"]:
            return cache["roles"][project]
        roles: set[str] = set()
        project_roles = frappe.db.get_all(
            "Project Team Details",
            filters={"parent": project},
            fields=["pt_role"],
        )
        for pr in project_roles:
            roles.add(pr.pt_role)
        cache["roles"][project] = roles
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
                    "task_subject": frappe.db.get_value("Task", doc, "subject") or doc,
                    "plan_required": plan_required,
                    "plan_task_subject": (plan or {}).get("subject")
                    or frappe.db.get_value("Task", doc, "subject")
                    or doc,
                    "has_linked_issue": has_linked_issue(doc)
                    if cache["project_settings"].get(proj) == "Обязательно для всех Запросов"
                    else None,
                    "root_task_with_issue": find_root_task_with_linked_issue(proj, doc)
                    if cache["project_settings"].get(proj) == "Обязательно для всех Запросов"
                    else None,
                }
            )

    return results
