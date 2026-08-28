# Copyright (c) 2026, Dinext
"""Whitelisted API для вызова из Desk / Server Script через frappe.call.
"""

from __future__ import annotations

import frappe

from project_workload_assignment.project_workload_assignment.forecast.forecast_from_assignments import run_update_forecast_from_assignments
from project_workload_assignment.project_workload_assignment.forecast.forecast_from_work_efforts import run_add_forecast_from_work_efforts
from project_workload_assignment.project_workload_assignment.project_workload.canonical import run_project_workload_tree_canonical, run_team_workload_grid_canonical
from project_workload_assignment.project_workload_assignment.project_workload.project_report.overload_check import run_check_workload_overload
from project_workload_assignment.project_workload_assignment.project_workload.project_report.single_project_workload_tree import run_get_project_workload_data
from project_workload_assignment.project_workload_assignment.project_workload.project_report.tasks_forecast_workload import run_get_tasks_forecast_and_workload
from project_workload_assignment.project_workload_assignment.project_workload.team_report.chart_aggregates import run_get_project_workload_charts, run_get_team_workload_charts
from project_workload_assignment.project_workload_assignment.project_workload.team_report.team_workload_grid import run_get_projects_workload_data_v2
from project_workload_assignment.project_workload_assignment.work_efforts.consolidated_data import run_get_work_efforts_consolidated_data
from project_workload_assignment.project_workload_assignment.work_efforts.grid_data import run_get_work_efforts_grid
from project_workload_assignment.project_workload_assignment.work_efforts.models import ConsolidatedDataFormInput, ConsolidatedDataResponse, SaveForecastAsPlanFormInput, TimesheetLimitsFormInput, TimesheetLimitsResponse, WeGridFormInput, WeGridResponse, WeSaveForecastFormInput, WorkEffortsProgressResponse
from project_workload_assignment.project_workload_assignment.work_efforts.work_efforts_progress import run_get_work_efforts_progress
from project_workload_assignment.project_workload_assignment.work_efforts.save_changes import run_save_forecast_changes
from project_workload_assignment.project_workload_assignment.work_efforts.save_forecast_as_plan import run_save_forecast_as_plan
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits import run_calculate_timesheet_limits
from project_workload_assignment.project_workload_assignment.work_efforts.user_timesheet_limits import run_calculate_user_timesheet_limits
from project_workload_assignment.project_workload_assignment.project_workload.models import (
	ChartResponse,
	ErrorOverloadResponse,
	ErrorResponse,
	ErrorTasksResponse,
	ErrorTeamWorkloadResponse,
	OverloadCheckFormInput,
	OverloadCheckResponse,
	ProjectChartFormInput,
	ProjectWorkloadFormInput,
	ProjectWorkloadResponse,
	TasksForecastFormInput,
	TasksForecastResponse,
	TeamChartFormInput,
	TeamWorkloadFormInput,
	TeamWorkloadResponse,
	UpdateForecastFromAssignmentsFormInput,
)

@frappe.whitelist()
def pwr_run_team_workload_grid(**kwargs) -> TeamWorkloadResponse | ErrorTeamWorkloadResponse:
	"""Legacy team grid wire (pre-canonical). Prefer ``pwr_run_team_workload_grid_canonical``."""
	form_input: TeamWorkloadFormInput = frappe._dict(frappe.form_dict)
	for key, value in kwargs.items():
		if value is not None:
			form_input[key] = value
	return run_get_projects_workload_data_v2(form_input)


@frappe.whitelist()
def pwr_run_project_workload_tree() -> ProjectWorkloadResponse | ErrorResponse:
	"""Legacy project tree wire (pre-canonical). Prefer ``pwr_run_project_workload_tree_canonical``."""
	form_input: ProjectWorkloadFormInput = frappe.form_dict
	return run_get_project_workload_data(form_input)


@frappe.whitelist()
def pwr_run_team_workload_grid_canonical(**kwargs) -> dict:
	"""Team grid for DinextTable: canonical GridResponse ``{ periods, rows, meta }``."""
	form_input: TeamWorkloadFormInput = frappe._dict(frappe.form_dict)
	for key, value in kwargs.items():
		if value is not None:
			form_input[key] = value
	return run_team_workload_grid_canonical(form_input)


@frappe.whitelist()
def pwr_run_project_workload_tree_canonical(**kwargs) -> dict:
	"""Project tree for DinextTable: nested rows."""
	form_input: ProjectWorkloadFormInput = frappe._dict(frappe.form_dict)
	for key, value in kwargs.items():
		if value is not None:
			form_input[key] = value
	return run_project_workload_tree_canonical(form_input)


@frappe.whitelist()
def pwr_run_tasks_forecast_workload() -> TasksForecastResponse | ErrorTasksResponse:
	"""Прогноз PWE и факт PWA по задачам проекта."""
	form_input: TasksForecastFormInput = frappe.form_dict
	return run_get_tasks_forecast_and_workload(form_input)


@frappe.whitelist()
def pwr_run_team_workload_charts() -> ChartResponse:
	"""Сводный график Projects Workload Report."""
	form_input: TeamChartFormInput = frappe.form_dict
	return run_get_team_workload_charts(form_input)


@frappe.whitelist()
def pwr_run_project_workload_charts() -> ChartResponse:
	"""Сводный график вкладки «Загрузка» проекта."""
	form_input: ProjectChartFormInput = frappe.form_dict
	return run_get_project_workload_charts(form_input)


@frappe.whitelist()
def pwr_get_project_role_options(**kwargs) -> list[dict[str, str]]:
	"""Опции MultiSelect «роль» для PWR.

	- project задан → строго Project Team Details;
	- иначе → distinct PWA.role в scope общего отчёта.
	"""
	from project_workload_assignment.project_workload_assignment.project_workload.core.project_role_helpers import (
		options_from_project_team,
		options_from_pwr_scope,
	)
	from project_workload_assignment.project_workload_assignment.project_workload.core.worker_wtype_helpers import (
		normalize_worker_wtype_filter,
	)
	from project_workload_assignment.project_workload_assignment.project_workload.core.periods import (
		generate_periods_for_pwr_report,
	)
	from project_workload_assignment.project_workload_assignment.project_workload.core.windows import (
		compute_assignment_sql_lower_bound,
		get_visible_window,
	)

	fd = frappe._dict(frappe.form_dict)
	for key, value in kwargs.items():
		if value is not None:
			fd[key] = value

	project = (fd.get("project") or "").strip() or None
	if project:
		return options_from_project_team(project)

	view_type = fd.get("view_type") or "weekly"
	period_range = fd.get("period_range") or "quarter"
	period_anchor_date = fd.get("period_anchor_date")
	periods = generate_periods_for_pwr_report(view_type, period_range, period_anchor_date)
	display_start, display_end = get_visible_window(periods, view_type)
	window_start = str(frappe.utils.getdate(compute_assignment_sql_lower_bound(display_start)))
	window_end = str(frappe.utils.getdate(display_end))

	return options_from_pwr_scope(
		window_start=window_start,
		window_end=window_end,
		user=(fd.get("user") or "").strip() or None,
		project=None,
		project_portfolio=(fd.get("project_portfolio") or "").strip() or None,
		user_group=(fd.get("user_group") or "").strip() or None,
		worker_wtype_filter=normalize_worker_wtype_filter(fd.get("worker_wtype")),
	)


@frappe.whitelist()
def pwr_run_add_forecast_from_work_efforts():
	"""Add P&L forecast from work efforts."""
	return run_add_forecast_from_work_efforts(frappe.form_dict)


@frappe.whitelist()
def pwr_run_check_workload_overload() -> OverloadCheckResponse | ErrorOverloadResponse:
	"""Legacy alias of ``check_workload_overload``."""
	return check_workload_overload()


@frappe.whitelist()
def check_workload_overload() -> OverloadCheckResponse | ErrorOverloadResponse:
	"""Проверка перегрузки PWA vs PWE (Work Efforts UI)."""
	form_input: OverloadCheckFormInput = frappe.form_dict
	return run_check_workload_overload(form_input)


@frappe.whitelist()
def get_work_efforts_consolidated_data() -> ConsolidatedDataResponse:
	"""Consolidated Work Efforts data for a project."""
	form_input: ConsolidatedDataFormInput = frappe.form_dict
	return run_get_work_efforts_consolidated_data(form_input)


@frappe.whitelist()
def get_work_efforts_progress(project: str | None = None) -> WorkEffortsProgressResponse:
	"""Plan/fact scalars for Project Details «Трудозатраты» percent bar."""
	project = project or frappe.form_dict.get("project")
	return run_get_work_efforts_progress(project)


@frappe.whitelist()
def get_work_efforts_grid() -> WeGridResponse:
	"""Scalar Work Efforts grid (DinextTable)."""
	form_input: WeGridFormInput = frappe.form_dict
	return run_get_work_efforts_grid(form_input)


@frappe.whitelist()
def we_save_forecast_changes() -> dict:
	"""Batch save forecast changes from WE grid."""
	form_input: WeSaveForecastFormInput = frappe.form_dict
	return run_save_forecast_changes(form_input)


@frappe.whitelist()
def get_work_efforts_grid_v2() -> WeGridResponse:
	"""Deprecated alias of get_work_efforts_grid."""
	return get_work_efforts_grid()


@frappe.whitelist()
def we_v2_save_forecast_changes() -> dict:
	"""Deprecated alias of we_save_forecast_changes."""
	return we_save_forecast_changes()


@frappe.whitelist()
def save_work_efforts_forecast_changes() -> dict:
	"""Deprecated alias of we_save_forecast_changes."""
	return we_save_forecast_changes()

@frappe.whitelist()
def calculate_timesheet_limits() -> TimesheetLimitsResponse:
	"""Calculate plan/fact limits for timesheet positions."""
	form_input: TimesheetLimitsFormInput = frappe.form_dict
	return run_calculate_timesheet_limits(form_input)


@frappe.whitelist()
def calculate_user_timesheet_limits() -> TimesheetLimitsResponse:
	"""SS V4 rules for User Timesheet dialog. Not for WE per-month cells."""
	form_input: TimesheetLimitsFormInput = frappe.form_dict
	return run_calculate_user_timesheet_limits(form_input)


@frappe.whitelist()
def save_forecast_as_plan() -> int:
	"""Save forecast values as plan in Project Work Efforts."""
	form_input: SaveForecastAsPlanFormInput = frappe.form_dict
	return run_save_forecast_as_plan(form_input)


@frappe.whitelist()
def update_forecast_from_assignments():
	"""Обновляет pwea_expected по назначениям PWA."""
	form_input: UpdateForecastFromAssignmentsFormInput = frappe.form_dict
	return run_update_forecast_from_assignments(form_input)
