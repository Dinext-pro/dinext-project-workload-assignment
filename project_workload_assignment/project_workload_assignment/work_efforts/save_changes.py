# Copyright (c) 2026, Dinext
"""Batch save forecast changes for WE grid v2.

ISS-2026-00926: фаза 8 — редактирование прогноза в DinextTable.
API method: we_save_forecast_changes
"""

from __future__ import annotations

import json

import frappe
from frappe.utils import cint

from project_workload_assignment.project_workload_assignment.work_efforts.consolidated_data import (
    build_aggregated_work_efforts_tasks,
)
from project_workload_assignment.project_workload_assignment.work_efforts.grid_data import (
    flatten_consolidated_tasks_to_v2_rows,
)
from project_workload_assignment.project_workload_assignment.work_efforts.models import (
    WeSaveForecastChange,
    WeSaveForecastFormInput,
)
from project_workload_assignment.project_workload_assignment.work_efforts.periods import (
    get_display_periods,
    VIEW_MODE_FORECAST_AND_FACT,
)


def _to_float(value: object) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _load_grid_rows(project: str, view_mode: str = VIEW_MODE_FORECAST_AND_FACT) -> list:
    periods = get_display_periods(project, "month", view_mode)
    consolidated = build_aggregated_work_efforts_tasks(project)
    return flatten_consolidated_tasks_to_v2_rows(consolidated, periods, view_mode)


def _get_forecast(rows: list, task_id: str, role: str | None, period_key: str) -> float:
    for row in rows:
        if row.get("task_id") == task_id and row.get("role") == role:
            return _to_float(row.get(f"forecast_{period_key}"))
    return 0.0


def _get_child_forecast_sum(
    rows: list,
    task_id: str,
    role: str | None,
    period_key: str,
    excluded: list[str] | None = None,
) -> float:
    excluded = excluded or []
    child_tasks = {
        row.get("task_id")
        for row in rows
        if row.get("parent_task_id") == task_id and row.get("task_id") not in excluded
    }

    total = 0.0
    for child_id in child_tasks:
        if child_id in excluded:
            continue
        child_value = _get_forecast(rows, child_id, role, period_key)
        if child_value > 0:
            total += child_value
        else:
            total += _get_child_forecast_sum(rows, child_id, role, period_key, excluded + [child_id])
    return total


def _get_parent_forecast_limit(
    rows: list,
    task_id: str,
    role: str | None,
    period_key: str,
    excluded: list[str] | None = None,
) -> float | None:
    excluded = excluded or []
    row = next(
        (r for r in rows if r.get("task_id") == task_id and r.get("role") == role),
        None,
    )
    if not row:
        return None
    parent_id = row.get("parent_task_id")
    if not parent_id:
        return None

    parent_value = _get_forecast(rows, parent_id, role, period_key)
    if parent_value > 0:
        siblings_sum = _get_child_forecast_sum(rows, parent_id, role, period_key, excluded + [task_id])
        return parent_value - siblings_sum

    return _get_parent_forecast_limit(rows, parent_id, role, period_key, excluded + [task_id])


def _validate_change(rows: list, change: WeSaveForecastChange) -> str | None:
    task_id = change.get("task_id") or ""
    role = change.get("role") or None
    if role and not str(role).strip():
        role = None
    period_key = change.get("period_key") or ""
    value = _to_float(change.get("value"))

    if not task_id or not period_key:
        return frappe._("Missing task_id or period_key")

    children_sum = _get_child_forecast_sum(rows, task_id, role, period_key)
    if children_sum > 0 and value < children_sum:
        return frappe._("Value cannot be less than the sum of work efforts of child tasks ({0})"
        ).format(children_sum)

    parent_limit = _get_parent_forecast_limit(rows, task_id, role, period_key)
    if parent_limit is not None and value > parent_limit:
        return frappe._("Work efforts value cannot exceed {0} (parent task limit)"
        ).format(parent_limit)

    return None


def _save_forecast_change(project: str, change: WeSaveForecastChange) -> None:
    task_id = change.get("task_id") or ""
    role = change.get("role") or None
    if role and not str(role).strip():
        role = None
    period_key = change.get("period_key") or ""
    value = _to_float(change.get("value"))

    if not task_id or not period_key:
        return

    parts = period_key.split("_")
    if len(parts) != 2:
        return
    year = cint(parts[0])
    month = cint(parts[1])

    filters: dict[str, object] = {"pwe_project": project, "pwe_task": task_id}
    if role:
        filters["pwe_project_role"] = role
    else:
        filters["pwe_project_role"] = ["is", "not set"]

    pwe_name = frappe.db.get_value("Project Work Efforts", filters)
    if pwe_name:
        pwe_doc = frappe.get_doc("Project Work Efforts", pwe_name)
    else:
        pwe_doc = frappe.new_doc("Project Work Efforts")
        pwe_doc.pwe_project = project
        pwe_doc.pwe_task = task_id
        if role:
            pwe_doc.pwe_project_role = role
        pwe_doc.insert()

    existing = None
    for row in pwe_doc.pwe_amount:
        if cint(row.pwea_year) == year and cint(row.pwea_month) == month:
            existing = row
            break

    if existing:
        existing.pwea_expected = value
    else:
        pwe_doc.append(
            "pwe_amount",
            {
                "pwea_year": year,
                "pwea_month": month,
                "pwea_expected": value,
            },
        )

    pwe_doc.save()


def run_save_forecast_changes(form_dict: WeSaveForecastFormInput) -> dict:
    project = form_dict.get("project")
    if not project:
        frappe.throw(frappe._("Project is required"))

    changes_raw = form_dict.get("changes", "[]")
    if isinstance(changes_raw, list):
        changes: list[WeSaveForecastChange] = changes_raw
    else:
        changes = json.loads(changes_raw or "[]")

    if not changes:
        return {"saved": 0}

    rows = _load_grid_rows(project)

    for change in changes:
        error = _validate_change(rows, change)
        if error:
            frappe.throw(error)

    for change in changes:
        _save_forecast_change(project, change)

    return {"saved": len(changes)}
