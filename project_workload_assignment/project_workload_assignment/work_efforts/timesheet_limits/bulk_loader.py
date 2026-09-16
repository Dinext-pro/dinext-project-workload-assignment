# Copyright (c) 2026, Dinext
"""Bulk DB load for timesheet limits (Task / PWE / Limit Control)."""

from __future__ import annotations

from dataclasses import dataclass, field

import frappe

from project_workload_assignment.project_workload_assignment.work_efforts.models import (
	TimesheetPositionInput,
)


@dataclass
class TimesheetLimitsBulkData:
	task_meta: dict = field(default_factory=dict)
	children_map: dict = field(default_factory=dict)
	pwe_by_task_role: dict = field(default_factory=dict)
	pwe_amounts: dict = field(default_factory=dict)
	limit_rows_by_project: dict = field(default_factory=dict)


class TimesheetLimitsBulkLoader:
	@classmethod
	def load(cls, positions: list[TimesheetPositionInput]) -> TimesheetLimitsBulkData:
		unique_projects: set[str] = set()
		for pos in positions or []:
			if pos.get("project"):
				unique_projects.add(pos["project"])

		if not unique_projects:
			return TimesheetLimitsBulkData()

		project_list = list(unique_projects)
		task_meta: dict = {}
		children_map: dict = {}

		task_fields = ["name", "parent_task", "subject", "custom_linked_issue", "project"]
		try:
			raw_tasks = frappe.db.get_all(
				"Task",
				filters={"project": ["in", project_list]},
				fields=task_fields,
			)
		except Exception as exc:
			# TEMPORARY crutch: gantt Custom Field missing on PWA-only CI.
			# Remove when CI installs gantt or PWA owns the field.
			if "custom_linked_issue" not in str(exc) and "1054" not in str(exc):
				raise
			raw_tasks = frappe.db.get_all(
				"Task",
				filters={"project": ["in", project_list]},
				fields=["name", "parent_task", "subject", "project"],
			)
		for t in raw_tasks:
			task_meta[t.name] = {
				"subject": t.subject or t.name,
				"parent_task": t.parent_task or None,
				"custom_linked_issue": bool(getattr(t, "custom_linked_issue", None)),
			}
			proj = t.project or ""
			children_map.setdefault((proj, t.name), [])
			if t.parent_task:
				children_map.setdefault((proj, t.parent_task), [])
				children_map[(proj, t.parent_task)].append(t.name)

		all_pwe = frappe.db.get_all(
			"Project Work Efforts",
			filters={"pwe_project": ["in", project_list]},
			fields=["name", "pwe_project", "pwe_task", "pwe_project_role"],
		)
		pwe_by_task_role: dict = {}
		pwe_names: list[str] = []
		for p in all_pwe:
			key = (p.pwe_project, p.pwe_task, p.pwe_project_role)
			pwe_by_task_role.setdefault(key, []).append(p.name)
			pwe_names.append(p.name)

		pwe_amounts: dict = {}
		if pwe_names:
			from project_workload_assignment.project_workload_assignment.project_workload.team_report.chart_aggregates import (
				_resolve_plan_year_month,
			)

			fy_cache: dict = {}
			raw_amounts = frappe.db.get_all(
				"Project Work Efforts Amount",
				filters={"parent": ["in", pwe_names]},
				fields=["parent", "pwea_year", "pwea_month", "pwea_plan", "pwea_expected"],
			)
			for a in raw_amounts:
				resolved = _resolve_plan_year_month(a.pwea_year, a.pwea_month, fy_cache)
				if not resolved:
					continue
				year, month = resolved
				pwe_amounts.setdefault(a.parent, []).append(
					{
						"year": year,
						"month": month,
						"plan": frappe.utils.flt(a.pwea_plan or 0),
						"expected": frappe.utils.flt(a.pwea_expected or 0),
					}
				)

		limit_rows: dict = {}
		raw_limits = frappe.db.get_all(
			"Limit Control",
			filters={"parent": ["in", project_list], "parenttype": "Project"},
			fields=["parent", "type", "limit"],
		)
		for r in raw_limits:
			limit_rows.setdefault(r.parent, []).append({"type": r.type, "limit": r.limit})

		return TimesheetLimitsBulkData(
			task_meta=task_meta,
			children_map=children_map,
			pwe_by_task_role=pwe_by_task_role,
			pwe_amounts=pwe_amounts,
			limit_rows_by_project=limit_rows,
		)
