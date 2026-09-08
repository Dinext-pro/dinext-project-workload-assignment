# Copyright (c) 2026, Dinext
"""Port of Server Script «Get Work Efforts Consolidated Data».

ISS-2025-01239: миграция из Server Script в Python-модуль.
API method: get_work_efforts_consolidated_data
"""

from __future__ import annotations

import frappe

from project_workload_assignment.project_workload_assignment.work_efforts.models import (
    ConsolidatedDataFormInput,
    ConsolidatedDataResponse,
    ConsolidatedTaskEntry,
    WorkEffortRoleEntry,
)


_logger = frappe.logger("work_efforts")


def _to_float(value: object) -> float:
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def keep_role_entry(role_entry: WorkEffortRoleEntry) -> bool:
    """Named role, or empty-role row that still carries plan/forecast/fact amounts.

    Empty-role PWE is valid (UI shows «—»). Dropping it on reload made saves
    look successful then snap back to 0 after refresh.
    """
    role = role_entry.get("role")
    if role and str(role).strip():
        return True
    for key, value in role_entry.items():
        if key in ("role", "has_own_pwe") or str(key).startswith("fact_utps_"):
            continue
        if str(key).startswith(("plan_", "forecast_", "fact_")) and _to_float(value) != 0:
            return True
    return False


def _role_has_positive_fact(role_entry: WorkEffortRoleEntry) -> bool:
    for key, value in role_entry.items():
        if key.startswith("fact_") and not key.startswith("fact_utps_"):
            if _to_float(value) > 0:
                return True
    return False


def _find_role_entry(role_data: list[WorkEffortRoleEntry], role: object) -> WorkEffortRoleEntry | None:
    for entry in role_data:
        if entry.get("role") == role:
            return entry
    return None


def rollup_fact_to_parents(aggregated_tasks: dict[str, ConsolidatedTaskEntry]) -> None:
    """Sum child fact_* into the same-named parent role.

    Create a parent role row only when the child has fact > 0. Plan/forecast
    stay on the owning task. Matches V5–V7 `rollup_fact_data` (without the
    zero-hour / fact_utps-only edge that spawned empty parent rows).
    """
    tasks_for_rollup = list(aggregated_tasks.values())
    tasks_for_rollup.sort(key=lambda item: item.get("indent", 0), reverse=True)

    for child in tasks_for_rollup:
        parent_id = child.get("parent_task")
        if not parent_id or parent_id not in aggregated_tasks:
            continue
        parent = aggregated_tasks[parent_id]
        if "role_data" not in parent:
            parent["role_data"] = []

        for role_entry in child.get("role_data") or []:
            if not _role_has_positive_fact(role_entry):
                continue
            role = role_entry.get("role")
            parent_role_entry = _find_role_entry(parent["role_data"], role)
            if not parent_role_entry:
                parent_role_entry = {"role": role, "has_own_pwe": False}
                parent["role_data"].append(parent_role_entry)
            for key in list(role_entry.keys()):
                if key.startswith("fact_") and not key.startswith("fact_utps_"):
                    current_value = _to_float(role_entry.get(key, 0))
                    if not current_value:
                        continue
                    parent_value = _to_float(parent_role_entry.get(key, 0))
                    parent_role_entry[key] = parent_value + current_value
                elif key.startswith("fact_utps_"):
                    child_utps = role_entry.get(key) or []
                    parent_utps = parent_role_entry.get(key) or []
                    parent_role_entry[key] = parent_utps + child_utps


def build_aggregated_work_efforts_tasks(project: str) -> ConsolidatedDataResponse:
    """Единая загрузка Task + PWE + UTP, rollup fact, tree order.

    Используется legacy consolidated и WE grid v2 (без второго SQL-стека).
    """
    Task = frappe.qb.DocType("Task")
    tasks_query = (
        frappe.qb.from_(Task)
        .select(
            Task.name.as_("value"),
            Task.subject,
            Task.is_group.as_("expandable"),
            Task.parent_task,
            Task.type,
            Task.status,
            Task.custom_linked_issue,
            Task.color,
            Task.exp_start_date,
            Task.exp_end_date,
            Task.custom_planned_start_date,
            Task.custom_planned_end_date,
            Task.act_start_date,
            Task.act_end_date,
        )
        .where(Task.project == project)
        .where(Task.docstatus < 2)
        .where(Task.is_milestone == 0)
        .orderby(Task.parent_task)
        .orderby(Task.exp_start_date)
        .orderby(Task.exp_end_date)
    )
    tasks = tasks_query.run(as_dict=True)

    for task in tasks:
        task["indent"] = 0

    task_dict = {task["value"]: task for task in tasks}

    child_map: dict[str, list[str]] = {}
    for task in tasks:
        parent = task["parent_task"] or ""
        if parent not in child_map:
            child_map[parent] = []
        child_map[parent].append(task["value"])

    def build_hierarchy(parent_id: str, level: int, result_list: list[dict]) -> None:
        if parent_id in child_map:
            for child_id in child_map[parent_id]:
                if child_id in task_dict:
                    task = task_dict[child_id]
                    task["indent"] = level
                    result_list.append(task)
                    build_hierarchy(child_id, level + 1, result_list)

    hierarchical_tasks: list[dict] = []
    if "" in child_map:
        for root_id in child_map[""]:
            if root_id in task_dict:
                task = task_dict[root_id]
                task["indent"] = 0
                hierarchical_tasks.append(task)
                build_hierarchy(root_id, 1, hierarchical_tasks)

    tasks = hierarchical_tasks

    PWE = frappe.qb.DocType("Project Work Efforts")
    PWEA = frappe.qb.DocType("Project Work Efforts Amount")
    pwe_query = (
        frappe.qb.from_(PWE)
        .left_join(PWEA)
        .on(PWEA.parent == PWE.name)
        .select(
            PWE.name,
            PWE.pwe_task,
            PWE.pwe_project_role,
            PWEA.pwea_year,
            PWEA.pwea_month,
            PWEA.pwea_plan,
            PWEA.pwea_expected,
        )
        .where(PWE.pwe_project == project)
        .orderby(PWE.pwe_task, PWE.pwe_project_role)
    )
    pwe_list = pwe_query.run(as_dict=True)

    pwe_grouped: dict[tuple[str, str], dict] = {}
    for row in pwe_list:
        key = (row["pwe_task"], row["pwe_project_role"] or "")
        if key not in pwe_grouped:
            pwe_grouped[key] = {
                "task": row["pwe_task"],
                "role": row["pwe_project_role"],
                "plan_data": {},
                "forecast_data": {},
            }
        if row["pwea_year"] and row["pwea_month"]:
            month = str(int(row["pwea_month"]))
            period_key = f"{row['pwea_year']}_{month}"
            pwe_grouped[key]["plan_data"][period_key] = _to_float(row["pwea_plan"])
            pwe_grouped[key]["forecast_data"][period_key] = _to_float(row["pwea_expected"])

    UTP = frappe.qb.DocType("User Timesheet Position")
    ts_query = (
        frappe.qb.from_(UTP)
        .select(
            UTP.document_name.as_("task"),
            UTP.project_role,
            UTP.period,
            UTP.all_hours,
            UTP.name,
        )
        .where(UTP.project == project)
        .where(UTP.status == "Согласовано")
        .where(UTP.document_type == "Task")
    )
    ts_raw_data = ts_query.run(as_dict=True)

    fact_grouped: dict[tuple[str, str], dict] = {}
    for row in ts_raw_data:
        if row["period"]:
            parts = row["period"].split("-")
            if len(parts) >= 2:
                year = parts[0]
                month = str(int(parts[1]))
                period_key = f"{year}_{month}"
                key = (row["task"], row["project_role"] or "")
                if key not in fact_grouped:
                    fact_grouped[key] = {
                        "task": row["task"],
                        "role": row["project_role"],
                        "fact_data": {},
                        "fact_utps": {},
                    }
                current = fact_grouped[key]["fact_data"].get(period_key, 0)
                fact_grouped[key]["fact_data"][period_key] = current + _to_float(row["all_hours"])
                if period_key not in fact_grouped[key]["fact_utps"]:
                    fact_grouped[key]["fact_utps"][period_key] = []
                fact_grouped[key]["fact_utps"][period_key].append(row["name"])

    aggregated_tasks: dict[str, ConsolidatedTaskEntry] = {}
    for task in tasks:
        task_id = task["value"]
        aggregated_tasks[task_id] = {**task, "role_data": []}

    for (task_id, role), data in pwe_grouped.items():
        if task_id in aggregated_tasks:
            role_entry: WorkEffortRoleEntry = {"role": role, "has_own_pwe": True}
            for period_key, value in data["plan_data"].items():
                role_entry[f"plan_{period_key}"] = value
            for period_key, value in data["forecast_data"].items():
                role_entry[f"forecast_{period_key}"] = value
            aggregated_tasks[task_id]["role_data"].append(role_entry)

    for (task_id, role), data in fact_grouped.items():
        if task_id in aggregated_tasks:
            role_entry: WorkEffortRoleEntry | None = None
            for entry in aggregated_tasks[task_id]["role_data"]:
                if entry["role"] == role:
                    role_entry = entry
                    break
            if not role_entry:
                role_entry = {"role": role, "has_own_pwe": False}
                aggregated_tasks[task_id]["role_data"].append(role_entry)
            for period_key, hours in data["fact_data"].items():
                role_entry[f"fact_{period_key}"] = hours
            for period_key, utps in data["fact_utps"].items():
                role_entry[f"fact_utps_{period_key}"] = utps

    for task_id in aggregated_tasks:
        aggregated_tasks[task_id]["role_data"] = [
            r for r in aggregated_tasks[task_id]["role_data"] if keep_role_entry(r)
        ]

    rollup_fact_to_parents(aggregated_tasks)

    result_list: ConsolidatedDataResponse = []
    if "" in child_map:
        for root_id in child_map[""]:
            if root_id in aggregated_tasks:
                result_list.append(aggregated_tasks[root_id])

                def add_children(parent_id: str) -> None:
                    if parent_id in child_map:
                        for child_id in child_map[parent_id]:
                            if child_id in aggregated_tasks:
                                result_list.append(aggregated_tasks[child_id])
                                add_children(child_id)

                add_children(root_id)

    return result_list


def run_get_work_efforts_consolidated_data(
    form_dict: ConsolidatedDataFormInput,
) -> ConsolidatedDataResponse:
    project = form_dict.get("project")
    if not project:
        frappe.throw(frappe._("Project is required"))
    return build_aggregated_work_efforts_tasks(project)
