# Copyright (c) 2026, Dinext
"""Whitelisted API для вызова из Desk / Server Script через frappe.call.
"""

from __future__ import annotations

import frappe

from project_workload_assignment.project_workload_assignment.forecast.forecast_from_assignments import run_update_forecast_from_assignments
from project_workload_assignment.project_workload_assignment.forecast.forecast_from_work_efforts import run_add_forecast_from_work_efforts
from project_workload_assignment.project_workload_assignment.project_workload.canonical import run_project_workload_tree_canonical, run_team_workload_grid_canonical
from project_workload_assignment.project_workload_assignment.project_workload.project_report.overload_check import run_check_workload_overload
from project_workload_assignment.project_workload_assignment.project_workload.project_report.tasks_forecast_workload import run_get_tasks_forecast_and_workload
from project_workload_assignment.project_workload_assignment.project_workload.team_report.chart_aggregates import run_get_project_workload_charts, run_get_team_workload_charts
from project_workload_assignment.project_workload_assignment.work_efforts.consolidated_data import run_get_work_efforts_consolidated_data
from project_workload_assignment.project_workload_assignment.work_efforts.grid_data import run_get_work_efforts_grid
from project_workload_assignment.project_workload_assignment.work_efforts.models import ConsolidatedDataFormInput, ConsolidatedDataResponse, SaveForecastAsPlanFormInput, TimesheetLimitsFormInput, TimesheetLimitsResponse, WeGridFormInput, WeGridResponse, WeSaveForecastFormInput
from project_workload_assignment.project_workload_assignment.work_efforts.save_changes import run_save_forecast_changes
from project_workload_assignment.project_workload_assignment.work_efforts.save_forecast_as_plan import run_save_forecast_as_plan
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits import run_calculate_timesheet_limits
from project_workload_assignment.project_workload_assignment.project_workload.models import (
	ChartResponse,
	ErrorOverloadResponse,
	ErrorTasksResponse,
	OverloadCheckFormInput,
	OverloadCheckResponse,
	ProjectChartFormInput,
	ProjectWorkloadFormInput,
	TasksForecastFormInput,
	TasksForecastResponse,
	TeamChartFormInput,
	TeamWorkloadFormInput,
	UpdateForecastFromAssignmentsFormInput,
)

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
def pwr_run_add_forecast_from_work_efforts():
	"""Add P&L forecast from work efforts."""
	return run_add_forecast_from_work_efforts(frappe.form_dict)


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
def save_forecast_as_plan() -> int:
	"""Save forecast values as plan in Project Work Efforts."""
	form_input: SaveForecastAsPlanFormInput = frappe.form_dict
	return run_save_forecast_as_plan(form_input)


@frappe.whitelist()
def update_forecast_from_assignments():
	"""Обновляет pwea_expected по назначениям PWA."""
	form_input: UpdateForecastFromAssignmentsFormInput = frappe.form_dict
	return run_update_forecast_from_assignments(form_input)
