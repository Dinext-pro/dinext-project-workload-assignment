# Copyright (c) 2026, Dinext
"""Lightweight work efforts progress for Project Details dashboard bar.

Scalars only (plan/fact/percent) — no task/role/period tree.
Semantics aligned with Client Script `_get_plant_fact_efforts`:
PWE plan + UTP fact (Согласовано), project roles, display periods.
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


def _sum_plan_hours(project: str, roles: list[str], periods: list[dict]) -> float:
	PWE = frappe.qb.DocType("Project Work Efforts")
	PWEA = frappe.qb.DocType("Project Work Efforts Amount")

	period_criterion = Criterion.any(
		[(PWEA.pwea_year == p["year"]) & (PWEA.pwea_month == p["month"]) for p in periods]
	)

	row = (
		frappe.qb.from_(PWE)
		.inner_join(PWEA)
		.on(PWEA.parent == PWE.name)
		.select(Coalesce(Sum(PWEA.pwea_plan), 0).as_("total"))
		.where(PWE.pwe_project == project)
		.where(PWE.pwe_project_role.isin(roles))
		.where(period_criterion)
		.run(as_dict=True)
	)
	return flt(row[0]["total"] if row else 0)


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
