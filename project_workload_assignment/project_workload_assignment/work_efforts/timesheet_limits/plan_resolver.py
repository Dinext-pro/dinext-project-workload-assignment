# Copyright (c) 2026, Dinext
"""Hierarchical task plan resolution (ISS-2026-02105 / V4_EXP rules)."""

from __future__ import annotations

from project_workload_assignment.project_workload_assignment.work_efforts.models import PlanData
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.bulk_loader import (
	TimesheetLimitsBulkData,
)


class TaskPlanResolver:
	"""Own plan in month > sum children > walk to parent; omit period → all months."""

	@classmethod
	def resolve(
		cls,
		project: str,
		task: str,
		role: str,
		year: int | None,
		month: int | None,
		bulk: TimesheetLimitsBulkData,
		*,
		requirement: str = "Опционально",
		root_task_with_issue: str | None = None,
		can_go_above_root_issue: bool = False,
		plan_cache: dict | None = None,
	) -> PlanData | None:
		cache = plan_cache if plan_cache is not None else {}

		if year is None and month is None:
			return cls._resolve_all_periods(
				project,
				task,
				role,
				bulk,
				requirement=requirement,
				root_task_with_issue=root_task_with_issue,
				can_go_above_root_issue=can_go_above_root_issue,
				plan_cache=cache,
			)

		planned, plan_data = cls._plan_for_task_in_period(
			project,
			task,
			role,
			year,
			month,
			bulk,
			requirement=requirement,
			root_task_with_issue=root_task_with_issue,
			can_go_above_root_issue=can_go_above_root_issue,
			plan_cache=cache,
			visited=set(),
		)
		if planned > 0 and plan_data:
			ck = project + task + role + f"_{year}_{month}"
			cache[ck] = plan_data
			return plan_data
		return None

	@classmethod
	def _resolve_all_periods(
		cls,
		project: str,
		task: str,
		role: str,
		bulk: TimesheetLimitsBulkData,
		*,
		requirement: str,
		root_task_with_issue: str | None,
		can_go_above_root_issue: bool,
		plan_cache: dict,
	) -> PlanData | None:
		cache_key = project + task + role
		if cache_key in plan_cache:
			return plan_cache[cache_key]

		period_set: set[tuple[int, int]] = set()
		for key in bulk.pwe_by_task_role:
			if key[0] != project:
				continue
			for pwe_name in bulk.pwe_by_task_role[key]:
				for a in bulk.pwe_amounts.get(pwe_name, []):
					period_set.add((a["year"], a["month"]))

		total_planned = 0.0
		all_plan_sources: list[dict] = []
		for yr, mo in period_set:
			result = cls.resolve(
				project,
				task,
				role,
				yr,
				mo,
				bulk,
				requirement=requirement,
				root_task_with_issue=root_task_with_issue,
				can_go_above_root_issue=can_go_above_root_issue,
				plan_cache=plan_cache,
			)
			if result:
				total_planned += result["planned_hours"]
				if result.get("plan_sources"):
					all_plan_sources.extend(result["plan_sources"])

		if total_planned <= 0:
			return None

		subj = bulk.task_meta.get(task, {}).get("subject", task)
		plan_data: PlanData = {
			"task_name": task,
			"planned_hours": total_planned,
			"subject": subj,
			"plan_sources": all_plan_sources,
		}
		plan_cache[cache_key] = plan_data
		return plan_data

	@classmethod
	def _pwe_planned_for_period(
		cls, bulk: TimesheetLimitsBulkData, pwe_name: str, year: int, month: int
	) -> float:
		return sum(
			a["plan"]
			for a in bulk.pwe_amounts.get(pwe_name, [])
			if a["year"] == year and a["month"] == month
		)

	@classmethod
	def _plan_for_task_in_period(
		cls,
		project: str,
		task: str,
		role: str,
		year: int,
		month: int,
		bulk: TimesheetLimitsBulkData,
		*,
		requirement: str,
		root_task_with_issue: str | None,
		can_go_above_root_issue: bool,
		plan_cache: dict,
		visited: set[str],
	) -> tuple[float, PlanData | None]:
		if task in visited:
			return (0.0, None)
		visited.add(task)

		ck = project + task + role + f"_{year}_{month}"
		if ck in plan_cache:
			cached = plan_cache[ck]
			return (cached["planned_hours"], cached)

		pwe_list = bulk.pwe_by_task_role.get((project, task, role), [])
		if pwe_list:
			planned = sum(
				cls._pwe_planned_for_period(bulk, pwe, year, month) for pwe in pwe_list
			)
			if planned > 0:
				subj = bulk.task_meta.get(task, {}).get("subject", task)
				plan_data: PlanData = {
					"task_name": task,
					"planned_hours": planned,
					"subject": subj,
					"plan_sources": [],
				}
				plan_cache[ck] = plan_data
				return (planned, plan_data)

		direct_children = bulk.children_map.get((project, task), [])
		if direct_children:
			total_plan = 0.0
			found_any = False
			plan_sources: list[dict] = []
			for child in direct_children:
				child_plan, child_data = cls._plan_for_task_in_period(
					project,
					child,
					role,
					year,
					month,
					bulk,
					requirement=requirement,
					root_task_with_issue=root_task_with_issue,
					can_go_above_root_issue=can_go_above_root_issue,
					plan_cache=plan_cache,
					visited=visited.copy(),
				)
				if child_plan > 0 and child_data:
					total_plan += child_plan
					found_any = True
					plan_sources.append(
						{
							"task_name": child_data["task_name"],
							"subject": child_data["subject"],
							"planned_hours": child_plan,
						}
					)
			if found_any:
				plan_data: PlanData = {
					"task_name": task,
					"planned_hours": total_plan,
					"subject": bulk.task_meta.get(task, {}).get("subject", task),
					"plan_sources": plan_sources,
				}
				plan_cache[ck] = plan_data
				return (total_plan, plan_data)

		parent = bulk.task_meta.get(task, {}).get("parent_task")
		if parent:
			if (
				requirement == "Обязательно для всех Запросов"
				and root_task_with_issue
				and task == root_task_with_issue
				and not can_go_above_root_issue
			):
				return (0.0, None)
			parent_plan, parent_data = cls._plan_for_task_in_period(
				project,
				parent,
				role,
				year,
				month,
				bulk,
				requirement=requirement,
				root_task_with_issue=root_task_with_issue,
				can_go_above_root_issue=can_go_above_root_issue,
				plan_cache=plan_cache,
				visited=visited.copy(),
			)
			if parent_plan > 0 and parent_data:
				sources = list(parent_data.get("plan_sources") or [])
				if not sources:
					sources = [
						{
							"task_name": parent_data["task_name"],
							"subject": parent_data["subject"],
							"planned_hours": parent_plan,
						}
					]
				plan_data: PlanData = {
					"task_name": parent_data["task_name"],
					"planned_hours": parent_plan,
					"subject": parent_data["subject"],
					"plan_sources": sources,
				}
				plan_cache[ck] = plan_data
				return (parent_plan, plan_data)

		return (0.0, None)
