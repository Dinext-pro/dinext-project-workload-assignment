# Copyright (c) 2026, Dinext
"""Сборка scalar grid v2 из aggregated work efforts.

Фаза 1 (read): переиспользует `build_aggregated_work_efforts_tasks` — те же 3 SQL,
rollup fact, tree order. Отличие от legacy API — плоские scalar rows без role_data[].

Оптимизация:
- Сейчас: один shared loader (не дублируем SQL-логику в v2).
- Dual-table dev: клиент может переиспользовать frm.aggregatedTasks (см. data-load.js).
- Будущее (post-cutover): прямой scalar SQL без промежуточного role_data — отдельная задача.
"""

from __future__ import annotations

import frappe

from project_workload_assignment.project_workload_assignment.work_efforts.consolidated_data import (
	build_aggregated_work_efforts_tasks,
)
from project_workload_assignment.project_workload_assignment.work_efforts.models import (
	ConsolidatedTaskEntry,
	ViewMode,
	WeGridFormInput,
	WeGridResponse,
	WeRow,
	WorkEffortRoleEntry,
)
from project_workload_assignment.project_workload_assignment.work_efforts.periods import (
	get_display_periods,
	normalize_view_mode,
)
from project_workload_assignment.project_workload_assignment.work_efforts.summary import (
	build_we_summary_rows,
)


def _to_float(value: object) -> float:
	try:
		return float(value or 0)
	except (TypeError, ValueError):
		return 0.0


def _calc_delta_pct(plan: float, actual: float) -> float:
	if not plan:
		return 0.0
	return round(((actual - plan) / plan) * 100, 1)


def _resolve_actual(
	role_entry: WorkEffortRoleEntry,
	period_key: str,
	is_past: bool,
	view_mode: ViewMode,
) -> float:
	forecast = _to_float(role_entry.get(f"forecast_{period_key}"))
	fact = _to_float(role_entry.get(f"fact_{period_key}"))
	if view_mode == "forecast_only":
		return forecast
	if view_mode == "fact_only":
		return fact
	return fact if is_past else forecast


def _role_rows_for_task(task: ConsolidatedTaskEntry) -> list[WorkEffortRoleEntry]:
	role_data = [r for r in (task.get("role_data") or []) if (r.get("role") or "").strip()]
	if role_data:
		return sorted(role_data, key=lambda item: item.get("role") or "")
	return [{"role": None}]


def _flatten_task_to_rows(
	task: ConsolidatedTaskEntry,
	periods: list,
	view_mode: ViewMode,
	parent_has_child: set[str],
) -> list[WeRow]:
	task_id = task["value"]
	role_rows = _role_rows_for_task(task)
	merge_group_id = f"task-{task_id}"
	merge_size = len(role_rows)
	has_children = bool(task.get("expandable")) or task_id in parent_has_child

	flat_rows: list[WeRow] = []
	for index, role_entry in enumerate(role_rows):
		role = role_entry.get("role")
		row_id = f"{task_id}:{role or ''}"

		row: WeRow = {
			"id": row_id,
			"task_id": task_id,
			"task_subject": task.get("subject") if index == 0 else None,
			"role": role,
			"parent_task_id": task.get("parent_task"),
			"merge_group_id": merge_group_id,
			"merge_group_index": index,
			"merge_group_size": merge_size,
			"has_children": has_children if index == 0 else False,
			"indent": int(task.get("indent") or 0),
			"expandable": task.get("expandable") or 0,
			# даты задачи — для cellClassRules подсветки периодов (фаза 10)
			"exp_start_date": str(task["exp_start_date"]) if task.get("exp_start_date") else None,
			"exp_end_date": str(task["exp_end_date"]) if task.get("exp_end_date") else None,
			"custom_planned_start_date": (
				str(task["custom_planned_start_date"]) if task.get("custom_planned_start_date") else None
			),
			"custom_planned_end_date": (
				str(task["custom_planned_end_date"]) if task.get("custom_planned_end_date") else None
			),
			"act_start_date": str(task["act_start_date"]) if task.get("act_start_date") else None,
			"act_end_date": str(task["act_end_date"]) if task.get("act_end_date") else None,
		}

		for period in periods:
			period_key = period["key"]
			plan = _to_float(role_entry.get(f"plan_{period_key}"))
			forecast = _to_float(role_entry.get(f"forecast_{period_key}"))
			fact = _to_float(role_entry.get(f"fact_{period_key}"))
			actual = _resolve_actual(role_entry, period_key, period["is_past"], view_mode)

			row[f"plan_{period_key}"] = plan
			row[f"forecast_{period_key}"] = forecast
			row[f"fact_{period_key}"] = fact
			row[f"actual_{period_key}"] = actual
			row[f"delta_{period_key}"] = _calc_delta_pct(plan, actual)
			utps = role_entry.get(f"fact_utps_{period_key}")
			if utps:
				row[f"fact_utps_{period_key}"] = utps

		flat_rows.append(row)

	return flat_rows


def flatten_consolidated_tasks_to_v2_rows(
	tasks: list[ConsolidatedTaskEntry],
	periods: list,
	view_mode: ViewMode,
) -> list[WeRow]:
	"""Плоские scalar rows из consolidated tasks (shared contract для API и тестов)."""
	parent_has_child: set[str] = set()
	for task in tasks:
		parent_id = task.get("parent_task")
		if parent_id:
			parent_has_child.add(parent_id)

	rows: list[WeRow] = []
	for task in tasks:
		rows.extend(_flatten_task_to_rows(task, periods, view_mode, parent_has_child))
	return rows


def run_get_work_efforts_grid(form_dict: WeGridFormInput) -> WeGridResponse:
	project = form_dict.get("project")
	if not project:
		frappe.throw(frappe._("Project is required"))

	period_type = form_dict.get("period_type") or "month"
	view_mode = normalize_view_mode(form_dict.get("view_mode") or form_dict.get("view_options"))

	periods = get_display_periods(project, period_type, view_mode)
	consolidated = build_aggregated_work_efforts_tasks(project)
	rows = flatten_consolidated_tasks_to_v2_rows(consolidated, periods, view_mode)
	include_plan = form_dict.get("include_plan", True)
	if isinstance(include_plan, str):
		include_plan = include_plan not in ("0", "false", "False")
	summary_rows = build_we_summary_rows(
		project,
		consolidated,
		periods,
		view_mode,
		include_plan=bool(include_plan),
	)

	return {
		"project": project,
		"period_type": period_type,
		"view_mode": view_mode,
		"periods": periods,
		"rows": rows,
		"summary_rows": summary_rows,
	}
