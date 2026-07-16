# Copyright (c) 2026, Dinext
"""TypedDict для Project Workload API (form_dict + response).

Whitelist entrypoints — `api.py`.
Ядро расчёта импортирует типы отсюда.
"""

from __future__ import annotations

from datetime import date
from typing import Literal, TypedDict

from project_workload_assignment.project_workload_assignment.project_workload.core.periods import (
	PWRPeriod,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.types import (
	AbsenceEntry,
	HolidayEntry,
)

__all__ = [
	# form inputs
	"TeamWorkloadFormInput",
	"ProjectWorkloadFormInput",
	"ForecastPeriodInput",
	"TasksForecastFormInput",
	"TeamChartFormInput",
	"ProjectChartFormInput",
	"OverloadCheckFormInput",
	"UpdateForecastFromAssignmentsFormInput",
	# legacy aliases
	"TeamWorkloadFormDict",
	"FormDict",
	"ForecastFormDict",
	"ForecastPeriod",
	"OverloadPeriodInput",
	"OverloadCheckFormDict",
	"TeamChartFormDict",
	"ProjectChartFormDict",
	# responses / nested
	"TeamWorkloadPeriodDaily",
	"TeamWorkloadPeriodWeekly",
	"TeamWorkloadPeriodMonthly",
	"TeamWorkloadPeriod",
	"UserDataSummary",
	"TreeDataUserRow",
	"TreeDataProjectRow",
	"PerformanceInfo",
	"TeamWorkloadResponse",
	"ErrorTeamWorkloadResponse",
	"UserData",
	"TaskDict",
	"PeriodDaily",
	"PeriodWeekly",
	"PeriodMonthly",
	"Period",
	"UserHolidayEntry",
	"HolidayItem",
	"AbsenceItem",
	"TreeDataRow",
	"Metadata",
	"Performance",
	"DebugInfo",
	"ProjectWorkloadResponse",
	"ErrorResponse",
	"TaskUserDetail",
	"TaskPeriodDetail",
	"TaskRoleDetails",
	"TaskDetails",
	"TaskAggregated",
	"TasksForecastResponse",
	"ErrorTasksResponse",
	"ChartSeries",
	"ChartMeta",
	"ChartResponse",
	"OverloadMonthUser",
	"OverloadMonthDetail",
	"OverloadItem",
	"OverloadCheckResponse",
	"ErrorOverloadResponse",
]


# ==================== Form inputs (API) ====================


class TeamWorkloadFormInput(TypedDict, total=False):
	"""Входные параметры отчёта загрузки команды."""

	user: str | None
	project: str | None
	project_portfolio: str | None
	user_group: str | None
	view_type: Literal["daily", "weekly", "monthly"]
	period_range: Literal["quarter", "half_year", "year"]
	period_anchor_date: str | None
	load_actual: bool | str | int
	worker_wtype: str | None
	mode: Literal["full", "user_totals", "user_projects"]
	detail_user: str | None
	limit: str | int
	offset: str | int


class ProjectWorkloadFormInput(TypedDict, total=False):
	"""Входные параметры дерева загрузки проекта."""

	project: str
	view_type: Literal["daily", "weekly", "monthly"]
	date_from: str | date | None
	date_to: str | date | None
	no_agg: bool | str | int
	load_actual: bool | str | int
	worker_wtype: str | None


class ForecastPeriodInput(TypedDict, total=False):
	"""Период (год/месяц) для forecast / overload."""

	year: int
	month: int
	is_past: bool


class TasksForecastFormInput(TypedDict, total=False):
	"""Входные параметры прогноза задач."""

	project: str
	periods: list[ForecastPeriodInput] | None
	view_options: Literal["Только факт", "Только прогноз", "Прогноз и факт"]


class TeamChartFormInput(TypedDict, total=False):
	"""Входные параметры сводного графика PWR."""

	user: str | None
	project: str | None
	project_portfolio: str | None
	user_group: str | None
	view_type: Literal["daily", "weekly", "monthly"]
	period_range: Literal["quarter", "half_year", "year"]
	period_anchor_date: str | None
	worker_wtype: str | None
	load_utilization: bool | str | int
	load_actual: bool | str | int


class ProjectChartFormInput(TypedDict, total=False):
	"""Входные параметры графика вкладки «Загрузка»."""

	project: str
	view_type: Literal["daily", "weekly", "monthly"]
	date_from: str | None
	date_to: str | None
	worker_wtype: str | None
	load_actual: bool | str | int
	load_utilization: bool | str | int


class OverloadCheckFormInput(TypedDict, total=False):
	"""Входные параметры проверки перегрузки PWA vs PWE."""

	project: str
	periods: list[ForecastPeriodInput] | None
	view_options: Literal["Только факт", "Только прогноз", "Прогноз и факт"]


class UpdateForecastFromAssignmentsFormInput(TypedDict, total=False):
	"""Входные параметры update_forecast_from_assignments."""

	project: str
	updates_json: str


# Legacy aliases (domain modules / tests)
TeamWorkloadFormDict = TeamWorkloadFormInput
FormDict = ProjectWorkloadFormInput
ForecastPeriod = ForecastPeriodInput
ForecastFormDict = TasksForecastFormInput
OverloadPeriodInput = ForecastPeriodInput
OverloadCheckFormDict = OverloadCheckFormInput
TeamChartFormDict = TeamChartFormInput
ProjectChartFormDict = ProjectChartFormInput


# ==================== Team workload response ====================

class TeamWorkloadPeriodDaily(TypedDict):
	"""Дневной период для отчёта команды."""
	key: str
	date: str
	year: int
	month: int
	day: int
	weekday: int


class TeamWorkloadPeriodWeekly(TypedDict):
	"""Недельный период для отчёта команды."""
	key: str
	year: int
	week: int
	start_date: str
	end_date: str


class TeamWorkloadPeriodMonthly(TypedDict):
	"""Месячный период для отчёта команды."""
	key: str
	year: int
	month: int
	start_date: str
	end_date: str


TeamWorkloadPeriod = TeamWorkloadPeriodDaily | TeamWorkloadPeriodWeekly | TeamWorkloadPeriodMonthly


class UserDataSummary(TypedDict):
	"""Краткие данные пользователя для tree_data."""
	full_name: str | None
	user_image: str | None
	email: str
	name: str


class TreeDataUserRow(TypedDict, total=False):
	"""Строка пользователя в tree_data."""
	participant: str
	user_data: UserDataSummary
	indent: int
	expandable: bool
	_isUser: bool
	_detailsLoaded: bool
	_email: str
	_workingHours: dict[str, float]
	_absences: list[AbsenceEntry]
	_userHolidays: list[HolidayEntry]
	workload_total: str


class TreeDataProjectRow(TypedDict, total=False):
	"""Строка проекта в tree_data."""
	participant: str
	user_data: UserDataSummary
	project: str
	project_name: str
	indent: int
	expandable: bool
	_isProject: bool
	_email: str
	_project: str
	_workingHours: dict[str, float]
	_absences: list[AbsenceEntry]
	_userHolidays: list[HolidayEntry]
	_projectHolidays: list[HolidayEntry]
	workload_total: str


class PerformanceInfo(TypedDict):
	"""Информация о производительности."""
	calculation_time_ms: float
	assignments: int
	date_calculations: int
	working_day_cache_size: int
	trace: list[str]


class TeamWorkloadResponse(TypedDict):
	"""Основной ответ API get_projects_workload_data_v2."""
	tree_data: list[TreeDataUserRow | TreeDataProjectRow]
	periods: list[TeamWorkloadPeriod]
	users_count: int
	projects_count: int
	assignments_count: int
	mode: str
	limit: int
	offset: int
	next_offset: int | None
	has_more: bool
	total_users: int
	message: str
	performance: PerformanceInfo


class ErrorTeamWorkloadResponse(TypedDict):
	"""Ответ при ошибке."""
	tree_data: list
	periods: list
	users_count: int
	projects_count: int
	assignments_count: int
	mode: str
	error: str
	message: str

# ==================== Project workload response ====================

class UserData(TypedDict):
	"""Данные пользователя для ответа."""
	full_name: str
	user_image: str | None
	email: str
	name: str
	wholiday_list: str | None
	wtimesheet_template: str | None
	hours_on_date: float | None
	tt_working_hours_on_date: str | None


class TaskDict(TypedDict):
	"""Данные задачи в словаре tasks_dict."""
	task_id: str
	task_subject: str
	parent_task_id: str | None
	children: list[str]
	has_direct_load: bool
	exp_start_date: str | None
	exp_end_date: str | None


class PeriodDaily(TypedDict):
	"""Дневной период."""
	key: str
	date: str
	year: int
	month: int
	day: int
	weekday: int


class PeriodWeekly(TypedDict):
	"""Недельный период."""
	key: str
	date: str
	start_date: str
	end_date: str
	year: int
	week: int
	week_start: str
	week_end: str


class PeriodMonthly(TypedDict):
	"""Месячный период."""
	key: str
	date: str
	start_date: str
	end_date: str
	year: int
	month: int
	month_start: str
	month_end: str


Period = PeriodDaily | PeriodWeekly | PeriodMonthly


class UserHolidayEntry(TypedDict):
	"""Запись праздника пользователя."""
	date: str
	weekly_off: bool


class HolidayItem(TypedDict):
	"""Элемент праздника."""
	date: str
	description: str | None
	weekly_off: bool | None


class AbsenceItem(TypedDict):
	"""Элемент отсутствия."""
	from_date: date | str
	to_date: date | str
	type: str
	alfrom_hours: float | None
	alto_hours: float | None


class TreeDataRow(TypedDict):
	"""Строка данных дерева."""
	participant: str
	user_data: UserData
	role: str
	task_id: str | None
	task_subject: str | None
	indent: int
	expandable: bool
	isTask: bool | None
	isUser: bool | None
	isRole: bool | None
	email: str
	roleName: str | None
	level: str
	has_direct_load: bool | None
	workload_total: str


class Metadata(TypedDict):
	"""Метаданные ответа."""
	project_holidays: list[HolidayItem]
	user_holidays: dict[str, list[UserHolidayEntry]]
	user_absences: dict[str, list[AbsenceItem]]
	user_daily_hours: dict[str, dict[str, float]]
	monthly_plans_count: int
	project_dates: dict[str, str]
	display_dates: dict[str, str | None]


class Performance(TypedDict):
	"""Показатели производительности."""
	calculation_time_ms: float
	assignments: int
	workload_calculations: int


class DebugInfo(TypedDict):
	"""Отладочная информация."""
	weekend_logic: str
	loading_types_supported: list[str]
	project_weekly_off_dates_count: int
	monthly_plans_loaded: int
	structure: str


class ProjectWorkloadResponse(TypedDict):
	"""Основной ответ API get_project_workload_data."""
	tree_data: list[TreeDataRow]
	periods: list[Period]
	users_count: int
	tasks_count: int
	assignments_count: int
	message: str
	task_results: dict[str, dict[str, float]]
	hierarchical_task_results: dict[str, dict[str, float]]
	metadata: Metadata
	performance: Performance
	debug_info: DebugInfo


class ErrorResponse(TypedDict):
	"""Ответ при ошибке."""
	tree_data: list
	periods: list
	users_count: int
	tasks_count: int
	assignments_count: int
	error: str
	message: str

# ==================== Tasks forecast response ====================
class TaskUserDetail(TypedDict):
	"""Детали пользователя в задаче."""
	assigned_hours: float
	workload_type: str
	percentage: float


class TaskPeriodDetail(TypedDict):
	"""Детали периода в задаче."""
	forecast_hours: float
	plan_hours: float
	users: dict[str, TaskUserDetail]


class TaskRoleDetails(TypedDict):
	"""Детали роли в задаче."""
	period_key: TaskPeriodDetail


class TaskDetails(TypedDict):
	"""Детали задачи."""
	role: TaskRoleDetails


class TaskAggregated(TypedDict):
	"""Агрегированные данные задачи."""
	task: str
	task_subject: str
	total_forecast: float
	total_assigned: float


class TasksForecastResponse(TypedDict):
	"""Успешный ответ API get_tasks_forecast_and_workload."""
	tasks: list[TaskAggregated]
	tasks_details: dict[str, TaskDetails]
	total_tasks: int


class ErrorTasksResponse(TypedDict):
	"""Ответ при ошибке."""
	tasks: list[TaskAggregated]
	tasks_details: dict[str, TaskDetails]
	total_tasks: int
	error: str

# ==================== Charts ====================

class ChartSeries(TypedDict, total=False):
	capacity_hours: list[float]
	utilization_plan_hours: list[float]
	utilization_forecast_hours: list[float]
	workload_forecast_hours_by_wtype: dict[str, list[float]]
	project_plan_hours: list[float]
	team_capacity_hours: list[float]
	actual_hours_by_wtype: dict[str, list[float]]
class ChartMeta(TypedDict, total=False):
	worker_wtype_filter: str
	utilization_loaded: bool
	actual_loaded: bool
	users_in_scope: int
	project: str
class ChartResponse(TypedDict, total=False):
	periods: list[PWRPeriod]
	series: ChartSeries
	meta: ChartMeta
	error: str
	message: str

# ==================== Overload check response ====================
class OverloadMonthUser(TypedDict):
	"""Пользователь в детализации месяца перегрузки."""
	user: str
	user_full_name: str
	assigned: float
	workload_type: str
	wl_value: int


class OverloadMonthDetail(TypedDict):
	"""Детализация перегрузки по месяцу."""
	year: int
	month: int
	forecast_hours: float
	assigned_hours: float
	users: list[OverloadMonthUser]


class OverloadItem(TypedDict):
	"""Одна позиция перегрузки (задача + роль)."""
	task: str
	task_subject: str
	role: str
	total_forecast: float
	total_assigned: float
	overload: float
	months: list[OverloadMonthDetail]
	affected_users: int


class OverloadCheckResponse(TypedDict, total=False):
	"""Успешный ответ API check_workload_overload."""
	overloads: list[OverloadItem]
	total_overloads: int
	affected_tasks: int
	affected_users: int


class ErrorOverloadResponse(TypedDict):
	"""Ответ при ошибке."""
	overloads: list
	error: str
	message: str | None
