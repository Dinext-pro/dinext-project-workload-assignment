# Copyright (c) 2026, Dinext
"""Lightweight work efforts progress for Project Details dashboard bar.

Scalars only (plan/fact/percent) — no task/role/period tree.
Plan: TaskPlanResolver on root tasks (ISS-2026-02105, no parent+child double count).
Fact: UTP «Согласовано» sum, project roles, display periods.
"""

from __future__ import annotations

import frappe
from frappe.query_builder import Criterion
from frappe.query_builder.functions import Coalesce, Sum
from frappe.utils import flt

from project_workload_assignment.project_workload_assignment.work_efforts.models import (
	WorkEffortsProgressResponse,
)
from project_workload_assignment.project_workload_assignment.work_efforts.periods import (
	get_display_periods,
)
from project_workload_assignment.project_workload_assignment.work_efforts.summary import (
	get_project_roles,
)
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.bulk_loader import (
	TimesheetLimitsBulkData,
	TimesheetLimitsBulkLoader,
)
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.plan_resolver import (
	TaskPlanResolver,
)


def _empty() -> WorkEffortsProgressResponse:
	return {
		"plan_hours": 0.0,
		"fact_hours": 0.0,
		"percent": 0.0,
	}


def _calc_percent(plan: float, fact: float) -> float:
	if plan > 0:
		pct = (fact / plan) * 100
	elif fact > 0:
		pct = 100.0
	else:
		pct = 0.0
	return round(pct, 2)


def _root_task_names(bulk: TimesheetLimitsBulkData) -> list[str]:
	names: list[str] = []
	for name, meta in bulk.task_meta.items():
		parent = meta.get("parent_task")
		if not parent or parent not in bulk.task_meta:
			names.append(name)
	return names


def sum_hierarchical_plan_hours(
	project: str,
	roles: list[str],
	periods: list[dict],
	bulk: TimesheetLimitsBulkData,
) -> float:
	"""Project-level plan: resolve each root × role × period, no double-count."""
	if not roles or not periods:
		return 0.0
	cache: dict = {}
	total = 0.0
	for task in _root_task_names(bulk):
		for role in roles:
			for period in periods:
				plan = TaskPlanResolver.resolve(
					project,
					task,
					role,
					period["year"],
					period["month"],
					bulk,
					plan_cache=cache,
				)
				if plan:
					total += flt(plan["planned_hours"])
	return total


def _sum_plan_hours(project: str, roles: list[str], periods: list[dict]) -> float:
	bulk = TimesheetLimitsBulkLoader.load([{"project": project}])
	return sum_hierarchical_plan_hours(project, roles, periods, bulk)


def _sum_fact_hours(project: str, roles: list[str], periods: list[dict]) -> float:
	UTP = frappe.qb.DocType("User Timesheet Position")

	# UTP.period is date-like "YYYY-MM-…"; match display months.
	period_criterion = Criterion.any(
		[UTP.period.like(f"{p['year']}-{int(p['month']):02d}%") for p in periods]
	)

	row = (
		frappe.qb.from_(UTP)
		.select(Coalesce(Sum(UTP.all_hours), 0).as_("total"))
		.where(UTP.project == project)
		.where(UTP.status == "Согласовано")
		.where(UTP.document_type == "Task")
		.where(UTP.project_role.isin(roles))
		.where(period_criterion)
		.run(as_dict=True)
	)
	return flt(row[0]["total"] if row else 0)


def run_get_work_efforts_progress(project: str | None) -> WorkEffortsProgressResponse:
	if not project:
		frappe.throw(frappe._("Project is required"))

	roles = [r for r in get_project_roles(project) if r]
	periods = get_display_periods(project, "month")
	if not roles or not periods:
		return _empty()

	plan_hours = _sum_plan_hours(project, roles, periods)
	fact_hours = _sum_fact_hours(project, roles, periods)
	return {
		"plan_hours": plan_hours,
		"fact_hours": fact_hours,
		"percent": _calc_percent(plan_hours, fact_hours),
	}
