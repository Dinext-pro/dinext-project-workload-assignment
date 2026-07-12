# Copyright (c) 2026, Dinext
"""Whitelisted API для вызова из Server Script через frappe.call (RestrictedPython без import).

ISS-2026-00865: расчёт PWR/PWE/прогноза — только здесь и в `project_workload.*` этого app.
Server Script на сайте — тонкие обёртки (`frappe.call` на методы ниже), без копии ядра в `script`.
ISS-2026-00926: новый DinextAgGrid UI не меняет эти entrypoints; не возвращать логику в dinext_common.

Четыре точки входа (whitelist → api_method Server Script → модуль ядра):
- pwr_run_team_workload_grid → get_projects_workload_data_v2 → team_workload_grid.run_get_projects_workload_data_v2
- pwr_run_project_workload_tree → get_project_workload_data → single_project_workload_tree.run_get_project_workload_data
- pwr_run_tasks_forecast_workload → get_tasks_forecast_and_workload_v2 → tasks_forecast_workload.run_get_tasks_forecast_and_workload
- pwr_run_add_forecast_from_work_efforts → add_forecast_from_work_efforts → forecast_from_work_efforts.run_add_forecast_from_work_efforts
- pwr_run_check_workload_overload → check_workload_overload → overload_check.run_check_workload_overload
- get_work_efforts_consolidated_data → work_efforts.consolidated_data
- get_work_efforts_grid_v2 → work_efforts.v2.grid_data
- calculate_timesheet_limits → work_efforts.timesheet_limits
- save_forecast_as_plan → work_efforts.save_forecast_as_plan
- update_forecast_from_assignments → forecast_from_assignments
"""

from typing import TypedDict, Literal, TYPE_CHECKING

import frappe

from project_workload_assignment.project_workload_assignment.project_workload.project_report.single_project_workload_tree import (
	run_get_project_workload_data,
	ProjectWorkloadResponse,
	ErrorResponse,
)
from project_workload_assignment.project_workload_assignment.project_workload.project_report.tasks_forecast_workload import (
	run_get_tasks_forecast_and_workload,
	TasksForecastResponse,
	ErrorTasksResponse,
)
from project_workload_assignment.project_workload_assignment.project_workload.team_report.team_workload_grid import (
	run_get_projects_workload_data_v2,
	TeamWorkloadResponse,
	ErrorTeamWorkloadResponse,
)
from project_workload_assignment.project_workload_assignment.project_workload.team_report.chart_aggregates import (
	run_get_team_workload_charts,
	run_get_project_workload_charts,
	ChartResponse,
	TeamChartFormDict,
	ProjectChartFormDict,
)
from project_workload_assignment.project_workload_assignment.project_workload.forecast.forecast_from_work_efforts import (
	run_add_forecast_from_work_efforts,
)
from project_workload_assignment.project_workload_assignment.project_workload.project_report.overload_check import (
	run_check_workload_overload,
	OverloadCheckResponse,
	ErrorOverloadResponse,
)
from project_workload_assignment.project_workload_assignment.project_workload.forecast.forecast_from_assignments import (
	run_update_forecast_from_assignments,
)
from project_workload_assignment.project_workload_assignment.project_workload.work_efforts.consolidated_data import (
	run_get_work_efforts_consolidated_data,
)
from project_workload_assignment.project_workload_assignment.project_workload.work_efforts.models import (
	ConsolidatedDataFormInput,
	ConsolidatedDataResponse,
	SaveForecastAsPlanFormInput,
	TimesheetLimitsFormInput,
	TimesheetLimitsResponse,
)
from project_workload_assignment.project_workload_assignment.project_workload.work_efforts.timesheet_limits import (
	run_calculate_timesheet_limits,
)
from project_workload_assignment.project_workload_assignment.project_workload.work_efforts.save_forecast_as_plan import (
	run_save_forecast_as_plan,
)
from project_workload_assignment.project_workload_assignment.project_workload.work_efforts.v2.grid_data import (
	run_get_work_efforts_grid_v2,
)
from project_workload_assignment.project_workload_assignment.project_workload.work_efforts.v2.models import (
	WeV2GridFormInput,
	WeV2GridResponse,
	WeV2SaveForecastFormInput,
)
from project_workload_assignment.project_workload_assignment.project_workload.work_efforts.v2.save import (
	run_save_forecast_changes,
)


# ==================== TypedDict для входных данных ====================

class TeamWorkloadFormInput(TypedDict, total=False):
	"""Входные параметры для отчёта загрузки команды (team_workload_grid)."""
	user: str | None
	project: str | None
	project_portfolio: str | None
	user_group: str | None
	view_type: Literal['daily', 'weekly', 'monthly']
	period_range: Literal['quarter', 'half_year', 'year']
	period_anchor_date: str | None
	load_actual: bool | str | int
	worker_wtype: str | None
	mode: Literal['full', 'user_totals', 'user_projects']
	detail_user: str | None
	limit: str | int
	offset: str | int


class ProjectWorkloadFormInput(TypedDict, total=False):
	"""Входные параметры для дерева загрузки проекта (single_project_workload_tree)."""
	project: str
	view_type: Literal['daily', 'weekly', 'monthly']
	date_from: str | None
	date_to: str | None
	no_agg: bool | str | int
	load_actual: bool | str | int


class ForecastPeriodInput(TypedDict, total=False):
	"""Период из входных данных для прогноза задач."""
	year: int
	month: int
	is_past: bool


class TasksForecastFormInput(TypedDict, total=False):
	"""Входные параметры для прогноза задач (tasks_forecast_workload)."""
	project: str
	periods: list[ForecastPeriodInput] | None
	view_options: Literal['Только факт', 'Только прогноз', 'Прогноз и факт']


class TeamChartFormInput(TypedDict, total=False):
	"""Входные параметры для сводного графика PWR (ISS-2026-00002)."""
	user: str | None
	project: str | None
	project_portfolio: str | None
	user_group: str | None
	view_type: Literal['daily', 'weekly', 'monthly']
	period_range: Literal['quarter', 'half_year', 'year']
	period_anchor_date: str | None
	worker_wtype: str | None
	load_utilization: bool | str | int
	load_actual: bool | str | int


class ProjectChartFormInput(TypedDict, total=False):
	"""Входные параметры для графика вкладки «Загрузка» проекта."""
	project: str
	view_type: Literal['daily', 'weekly', 'monthly']
	date_from: str | None
	date_to: str | None
	worker_wtype: str | None
	load_actual: bool | str | int


class OverloadCheckFormInput(TypedDict, total=False):
	"""Входные параметры для проверки перегрузки PWA vs PWE."""
	project: str
	periods: list[ForecastPeriodInput] | None
	view_options: Literal['Только факт', 'Только прогноз', 'Прогноз и факт']


@frappe.whitelist()
def pwr_run_team_workload_grid(**kwargs) -> TeamWorkloadResponse | ErrorTeamWorkloadResponse:
	"""Отчёт загрузки команды (Projects Workload Report). API method: get_projects_workload_data_v2."""
	form_input: TeamWorkloadFormInput = frappe._dict(frappe.form_dict)
	for key, value in kwargs.items():
		if value is not None:
			form_input[key] = value
	return run_get_projects_workload_data_v2(form_input)


@frappe.whitelist()
def pwr_run_project_workload_tree() -> ProjectWorkloadResponse | ErrorResponse:
	"""Дерево загрузки одного проекта (форма Project). API method: get_project_workload_data."""
	form_input: ProjectWorkloadFormInput = frappe.form_dict
	return run_get_project_workload_data(form_input)


@frappe.whitelist()
def pwr_run_tasks_forecast_workload() -> TasksForecastResponse | ErrorTasksResponse:
	"""Прогноз PWE и факт PWA по задачам проекта. API method: get_tasks_forecast_and_workload_v2."""
	form_input: TasksForecastFormInput = frappe.form_dict
	return run_get_tasks_forecast_and_workload(form_input)


@frappe.whitelist()
def pwr_run_team_workload_charts() -> ChartResponse:
	"""Сводный график Projects Workload Report (ISS-2026-00002)."""
	form_input: TeamChartFormInput = frappe.form_dict
	return run_get_team_workload_charts(form_input)


@frappe.whitelist()
def pwr_run_project_workload_charts() -> ChartResponse:
	"""Сводный график вкладки «Загрузка» проекта (ISS-2026-00002)."""
	form_input: ProjectChartFormInput = frappe.form_dict
	return run_get_project_workload_charts(form_input)


@frappe.whitelist()
def pwr_run_add_forecast_from_work_efforts():
	"""Add P&L forecast from work efforts. API method: add_forecast_from_work_efforts."""
	return run_add_forecast_from_work_efforts(frappe.form_dict)


@frappe.whitelist()
def pwr_run_check_workload_overload() -> OverloadCheckResponse | ErrorOverloadResponse:
	"""Проверка перегрузки PWA vs PWE. API method: check_workload_overload."""
	form_input: OverloadCheckFormInput = frappe.form_dict
	return run_check_workload_overload(form_input)


@frappe.whitelist()
def check_workload_overload() -> OverloadCheckResponse | ErrorOverloadResponse:
	"""Проверка перегрузки (Work Efforts UI). API method: check_workload_overload."""
	form_input: OverloadCheckFormInput = frappe.form_dict
	return run_check_workload_overload(form_input)


class UpdateForecastFromAssignmentsFormInput(TypedDict, total=False):
	"""Входные параметры для update_forecast_from_assignments."""
	project: str
	updates_json: str


@frappe.whitelist()
def get_work_efforts_consolidated_data() -> ConsolidatedDataResponse:
	"""Consolidated Work Efforts data for a project."""
	form_input: ConsolidatedDataFormInput = frappe.form_dict
	return run_get_work_efforts_consolidated_data(form_input)


@frappe.whitelist()
def get_work_efforts_grid_v2() -> WeV2GridResponse:
	"""Scalar Work Efforts grid v2 (DinextTable)."""
	form_input: WeV2GridFormInput = frappe.form_dict
	return run_get_work_efforts_grid_v2(form_input)


@frappe.whitelist()
def we_v2_save_forecast_changes() -> dict:
	"""Batch save forecast changes from WE grid v2."""
	form_input: WeV2SaveForecastFormInput = frappe.form_dict
	return run_save_forecast_changes(form_input)


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
