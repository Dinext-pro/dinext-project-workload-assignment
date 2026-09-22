# Copyright (c) 2026, Dinext
"""Orchestrator: plan + fact + limit status for timesheet positions."""

from __future__ import annotations

import json

import frappe

from project_workload_assignment.project_workload_assignment.work_efforts.models import (
	LimitStatus,
	TimesheetLimitsFormInput,
	TimesheetLimitsResponse,
	TimesheetPositionInput,
)
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.bulk_loader import (
	TimesheetLimitsBulkData,
	TimesheetLimitsBulkLoader,
)
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.hours_aggregator import (
	TimesheetHoursAggregator,
)
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.parsing import (
	LimitsParsing,
)
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.plan_fact_adapter import (
	TimesheetPlanFactAdapter,
)


class TimesheetLimitsCalculator:
	"""Unified plan/limit calculator (ISS-2026-02105).

	Temporary home: PWA. Later: dinext_timesheets.
	``year``/``month`` on position → WE cell; omit → UT / all periods.
	"""

	@classmethod
	def run(cls, form_dict: TimesheetLimitsFormInput) -> TimesheetLimitsResponse:
		positions: list[TimesheetPositionInput] = LimitsParsing.as_json_list(
			form_dict.get("positions")
		)
		timesheet_name = form_dict.get("timesheet_name")
		session_limits_override = cls._session_limits_override(form_dict)

		bulk = TimesheetLimitsBulkLoader.load(positions)
		state = _CalculatorState(bulk=bulk)

		results: TimesheetLimitsResponse = []
		for pos in positions or []:
			results.extend(
				cls._results_for_position(
					pos,
					positions=positions,
					timesheet_name=timesheet_name,
					session_limits_override=session_limits_override,
					bulk=bulk,
					state=state,
				)
			)
		return results

	@classmethod
	def _session_limits_override(cls, form_dict: TimesheetLimitsFormInput) -> dict[str, float | None] | None:
		if not form_dict.get("project_limits"):
			return None
		raw_limits = form_dict.get("project_limits")
		if isinstance(raw_limits, str):
			raw_limits = json.loads(raw_limits)
		return LimitsParsing.parse_limit_rows(raw_limits or [])

	@classmethod
	def _results_for_position(
		cls,
		pos: TimesheetPositionInput,
		*,
		positions: list[TimesheetPositionInput],
		timesheet_name: str | None,
		session_limits_override: dict[str, float | None] | None,
		bulk: TimesheetLimitsBulkData,
		state: "_CalculatorState",
	) -> TimesheetLimitsResponse:
		utp = pos.get("name")
		doc = pos.get("document_name")
		role = pos.get("project_role", "")
		proj = pos.get("project")
		status = pos.get("status")
		year = LimitsParsing.as_int(pos.get("year"))
		month = LimitsParsing.as_int(pos.get("month"))

		if not doc:
			return []

		plan_required = state.is_plan_required(proj, doc)
		project_roles = cls._project_roles(proj, role, state)
		doc_subject = bulk.task_meta.get(doc, {}).get("subject", doc)
		rows: TimesheetLimitsResponse = []

		for project_role in project_roles:
			screen = TimesheetPlanFactAdapter.for_screen(
				bulk, proj or "", doc, project_role, year, month
			)
			planned = screen.plan_hours if screen else 0.0
			forecast = cls._forecast_hours(
				bulk, proj or "", doc, project_role, year, month
			)
			consumers = list(screen.consumers) if screen else [doc]

			total_hours = TimesheetHoursAggregator.aggregate(
				consumers,
				project_role,
				timesheet_name,
				status,
				positions,
				year=year,
				month=month,
				cache=state.total_hours_cache,
			)

			pct = int((total_hours.get("total", 0) / planned) * 100) if planned > 0 else 0
			limits = cls._project_limits(proj, session_limits_override, bulk)
			limit_status, limit = cls._limit_status(plan_required, planned, pct, limits)
			requirement = state.project_settings.get(proj, "Опционально")

			rows.append(
				{
					"project": proj,
					"position": utp,
					"document_name": doc,
					"role": project_role,
					"planned_hours": planned,
					"forecast_hours": forecast,
					"total_hours": total_hours.get("total", 0),
					"hours_data": total_hours,
					"completion_percentage": pct,
					"status": limit_status,
					"limit": limit,
					"used_parent_for_plan": bool(screen and screen.used_parent),
					"used_children_for_actual": len(consumers) > 1,
					"child_tasks_count": max(len(consumers) - 1, 0),
					"task_subject": doc_subject,
					"plan_required": plan_required,
					"plan_task_subject": screen.plan_task_subject if screen else doc_subject,
					"plan_sources": list(screen.plan_sources) if screen else [],
					"has_linked_issue": state.has_linked_issue(doc)
					if requirement == "Обязательно для всех Запросов"
					else None,
					"root_task_with_issue": state.find_root_task_with_linked_issue(proj, doc)
					if requirement == "Обязательно для всех Запросов"
					else None,
				}
			)
		return rows

	@classmethod
	def _forecast_hours(
		cls,
		bulk: TimesheetLimitsBulkData,
		project: str,
		task: str,
		role: str,
		year: int | None,
		month: int | None,
	) -> float:
		got = TimesheetPlanFactAdapter.result(
			bulk, project, task, role, year, month, hours_key="expected"
		)
		return float(got.plan_hours) if got else 0.0

	@classmethod
	def _project_roles(
		cls, project: str | None, role: str, state: "_CalculatorState"
	) -> list[str]:
		if role:
			return [role]
		return list(state.get_project_roles(project))

	@classmethod
	def _project_limits(
		cls,
		project: str | None,
		session_limits_override: dict[str, float | None] | None,
		bulk: TimesheetLimitsBulkData,
	) -> dict[str, float | None]:
		if session_limits_override is not None:
			return session_limits_override
		rows = bulk.limit_rows_by_project.get(project or "", [])
		return LimitsParsing.parse_limit_rows(rows)

	@classmethod
	def _limit_status(
		cls,
		plan_required: bool,
		planned: float,
		pct: int,
		limits: dict[str, float | None],
	) -> tuple[LimitStatus, int | float]:
		if plan_required and planned == 0:
			return "block", 0
		if planned <= 0:
			return "no-plan", 0
		if limits.get("block") and pct > limits["block"]:
			return "block", limits["block"]
		if limits.get("warning") and pct > limits["warning"]:
			return "warning", limits["warning"]
		if limits.get("message") and pct > limits["message"]:
			return "message", limits["message"]
		return "normal", 0


class _CalculatorState:
	"""Mutable per-request caches tied to one bulk load."""

	def __init__(self, bulk: TimesheetLimitsBulkData):
		self.bulk = bulk
		self.total_hours_cache: dict = {}
		self.project_settings: dict = {}
		self.root_task_with_issue_cache: dict = {}

	def has_linked_issue(self, task_name: str) -> bool:
		return self.bulk.task_meta.get(task_name, {}).get("custom_linked_issue", False)

	def find_root_task_with_linked_issue(
		self, project: str | None, task: str
	) -> str | None:
		ck = (project or "") + task
		if ck in self.root_task_with_issue_cache:
			return self.root_task_with_issue_cache[ck]
		current = task
		while current:
			if self.has_linked_issue(current):
				self.root_task_with_issue_cache[ck] = current
				return current
			current = self.bulk.task_meta.get(current, {}).get("parent_task")
		self.root_task_with_issue_cache[ck] = None
		return None

	def is_plan_required(self, project: str | None, task_name: str) -> bool:
		if not project or not task_name:
			return False
		if project not in self.project_settings:
			requirement = frappe.db.get_value(
				"Project", project, "custom_обязательность_плановых_трудозатрат"
			)
			self.project_settings[project] = requirement or "Опционально"
		requirement = self.project_settings[project]
		if requirement == "Опционально":
			return False
		if requirement == "Обязательно для всех Задач":
			return True
		if requirement == "Обязательно для всех Запросов":
			return self.find_root_task_with_linked_issue(project, task_name) is not None
		return False

	def get_project_roles(self, project: str | None) -> set[str]:
		roles: set[str] = set()
		project_roles = frappe.db.get_all(
			"Project Team Details",
			filters={"parent": project},
			fields=["pt_role"],
		)
		for pr in project_roles:
			roles.add(pr.pt_role)
		return roles
