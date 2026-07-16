# Copyright (c) 2026, Dinext
"""Summary row WE v2 — parity с legacy calc_we_column_total (root rollup)."""

from __future__ import annotations

import frappe

from project_workload_assignment.project_workload_assignment.work_efforts.models import (
	ConsolidatedTaskEntry,
	ViewMode,
	WeDisplayPeriod,
	WeRow,
)

WE_V2_SUMMARY_ROW_ID = "we-total"


def _calc_delta_pct(plan: float, actual: float) -> float:
	if not plan:
		return 0.0
	return round(((actual - plan) / plan) * 100, 1)


def _to_float(value: object) -> float:
	try:
		return float(value or 0)
	except (TypeError, ValueError):
		return 0.0


def get_project_roles(project: str) -> list[str]:
	doc = frappe.get_cached_doc("Project", project)
	roles = [d.pt_role for d in (doc.custom_ts_details or []) if getattr(d, "pt_role", None)]
	return list(dict.fromkeys(roles))


def _make_aggregator(tasks: list[ConsolidatedTaskEntry]) -> dict:
	tasks_by_id: dict[str, ConsolidatedTaskEntry] = {}
	children_map: dict[str, list[str]] = {}
	role_value_map: dict[str, dict[str, dict[str, float]]] = {}
	root_ids: list[str] = []

	for task in tasks:
		task_id = task["value"]
		tasks_by_id[task_id] = task
		parent = task.get("parent_task") or ""
		if parent:
			children_map.setdefault(parent, []).append(task_id)
		else:
			root_ids.append(task_id)

		role_map: dict[str, dict[str, float]] = {}
		for role_entry in task.get("role_data") or []:
			role = role_entry.get("role")
			if not role:
				continue
			values: dict[str, float] = {}
			for key, raw in role_entry.items():
				if key.startswith(("plan_", "fact_", "forecast_")):
					values[key] = _to_float(raw)
			role_map[role] = values
		role_value_map[task_id] = role_map

	memo: dict[str, float] = {}

	def compute_sum_iterative(task_id: str, role: str, value_key: str, year: int, month: int) -> float:
		role_key = f"{value_key}_{year}_{month}"
		memo_key = f"{task_id}|{role}|{role_key}"
		if memo_key in memo:
			return memo[memo_key]

		stack: list[tuple[str, int]] = [(task_id, 0)]
		while stack:
			node_id, state = stack.pop()
			key = f"{node_id}|{role}|{role_key}"
			if state == 0:
				if key in memo:
					continue
				stack.append((node_id, 1))
				for child_id in children_map.get(node_id, []):
					child_key = f"{child_id}|{role}|{role_key}"
					if child_key not in memo:
						stack.append((child_id, 0))
			else:
				total = 0.0
				for child_id in children_map.get(node_id, []):
					direct = role_value_map.get(child_id, {}).get(role, {}).get(role_key, 0.0)
					if direct > 0:
						total += direct
					else:
						total += memo.get(f"{child_id}|{role}|{role_key}", 0.0)
				memo[key] = total

		return memo.get(memo_key, 0.0)

	return {
		"children_map": children_map,
		"role_value_map": role_value_map,
		"root_ids": root_ids,
		"compute_sum_iterative": compute_sum_iterative,
	}


def calc_we_column_total(
	tasks: list[ConsolidatedTaskEntry],
	roles: list[str],
	period: WeDisplayPeriod,
	view_mode: ViewMode,
	calc_plan: bool = True,
) -> tuple[float, float]:
	aggregator = _make_aggregator(tasks)
	year = period["year"]
	month = period["month"]
	is_past = period["is_past"]
	plan_key = f"plan_{year}_{month}"

	if view_mode == "forecast_only":
		actual_value_key = "forecast"
	elif view_mode == "fact_only":
		actual_value_key = "fact"
	else:
		actual_value_key = "fact" if is_past else "forecast"
	actual_key = f"{actual_value_key}_{year}_{month}"

	total_plan = 0.0
	total_actual = 0.0
	compute_sum = aggregator["compute_sum_iterative"]
	role_value_map = aggregator["role_value_map"]

	for role in roles:
		for root_id in aggregator["root_ids"]:
			role_map = role_value_map.get(root_id, {}).get(role, {})
			plan_sum = role_map.get(plan_key, 0.0)
			actual_sum = role_map.get(actual_key, 0.0)
			if calc_plan and not plan_sum:
				plan_sum = compute_sum(root_id, role, "plan", year, month)
			if not actual_sum:
				actual_sum = compute_sum(root_id, role, actual_value_key, year, month)
			total_plan += plan_sum
			total_actual += actual_sum

	return total_plan, total_actual


def build_we_summary_rows(
	project: str,
	tasks: list[ConsolidatedTaskEntry],
	periods: list[WeDisplayPeriod],
	view_mode: ViewMode,
	include_plan: bool = True,
) -> list[WeRow]:
	roles = get_project_roles(project)
	if not roles:
		return []

	row: WeRow = {
		"id": WE_V2_SUMMARY_ROW_ID,
		"task_id": WE_V2_SUMMARY_ROW_ID,
		"task_subject": frappe._("Итого"),
		"role": None,
		"parent_task_id": None,
		"merge_group_id": WE_V2_SUMMARY_ROW_ID,
		"merge_group_index": 0,
		"merge_group_size": 1,
		"has_children": False,
	}

	for period in periods:
		key = period["key"]
		plan, actual = calc_we_column_total(tasks, roles, period, view_mode, include_plan)
		row[f"plan_{key}"] = plan
		row[f"actual_{key}"] = actual
		row[f"delta_{key}"] = _calc_delta_pct(plan, actual)

	return [row]
