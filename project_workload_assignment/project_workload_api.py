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
"""

from typing import TypedDict, Literal, TYPE_CHECKING

import frappe

from project_workload_assignment.project_workload_assignment.project_workload.single_project_workload_tree import (
	run_get_project_workload_data,
	ProjectWorkloadResponse,
	ErrorResponse,
)
from project_workload_assignment.project_workload_assignment.project_workload.tasks_forecast_workload import (
	run_get_tasks_forecast_and_workload,
	TasksForecastResponse,
	ErrorTasksResponse,
)
from project_workload_assignment.project_workload_assignment.project_workload.team_workload_grid import (
	run_get_projects_workload_data_v2,
	TeamWorkloadResponse,
	ErrorTeamWorkloadResponse,
)
from project_workload_assignment.project_workload_assignment.project_workload.chart_aggregates import (
	run_get_team_workload_charts,
	run_get_project_workload_charts,
	ChartResponse,
	TeamChartFormDict,
	ProjectChartFormDict,
)
from project_workload_assignment.project_workload_assignment.project_workload.forecast_from_work_efforts import (
	run_add_forecast_from_work_efforts,
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
