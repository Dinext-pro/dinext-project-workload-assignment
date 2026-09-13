# Copyright (c) 2026, Dinext
"""TypedDict для Work Efforts API (consolidated, grid, save, timesheet limits)."""

from __future__ import annotations

from typing import Literal, TypedDict


# --- consolidated_data ---


class ConsolidatedDataFormInput(TypedDict, total=False):
	"""Входные параметры для consolidated_data."""

	project: str


class WorkEffortRoleEntry(TypedDict, total=False):
	"""Строка role_data; дополнительно plan_*, forecast_*, fact_*, fact_utps_* по периодам."""

	role: str
	has_own_pwe: bool


class ConsolidatedTaskEntry(TypedDict, total=False):
	"""Задача с агрегированными plan/forecast/fact по ролям."""

	value: str
	subject: str | None
	expandable: int | bool
	parent_task: str | None
	type: str | None
	status: str | None
	custom_linked_issue: str | None
	color: str | None
	exp_start_date: str | None
	exp_end_date: str | None
	custom_planned_start_date: str | None
	custom_planned_end_date: str | None
	act_start_date: str | None
	act_end_date: str | None
	indent: int
	role_data: list[WorkEffortRoleEntry]


ConsolidatedDataResponse = list[ConsolidatedTaskEntry]


# --- get_work_efforts_grid ---


ViewMode = Literal["forecast_and_fact", "forecast_only", "fact_only"]


class WeGridFormInput(TypedDict, total=False):
	"""Входные параметры get_work_efforts_grid."""

	project: str
	period_type: str
	view_mode: ViewMode
	view_options: str
	include_plan: bool | str | int


class WeDisplayPeriod(TypedDict):
	"""Период отображения (месяц)."""

	year: int
	month: int
	key: str
	is_past: bool


class WeRow(TypedDict, total=False):
	"""Одна строка grid: 1 роль на задачу (merge-group member)."""

	id: str
	task_id: str
	task_subject: str | None
	role: str | None
	parent_task_id: str | None
	merge_group_id: str
	merge_group_index: int
	merge_group_size: int
	has_children: bool
	indent: int
	expandable: int | bool
	exp_start_date: str | None
	exp_end_date: str | None
	custom_planned_start_date: str | None
	custom_planned_end_date: str | None
	act_start_date: str | None
	act_end_date: str | None
	has_own_pwe: bool


class WeGridResponse(TypedDict):
	"""Ответ get_work_efforts_grid."""

	project: str
	period_type: str
	view_mode: ViewMode
	periods: list[WeDisplayPeriod]
	rows: list[WeRow]
	summary_rows: list[WeRow]


# --- we_save_forecast_changes ---


class WeSaveForecastChange(TypedDict, total=False):
	"""Одно изменение прогноза из WE grid."""

	task_id: str
	role: str | None
	period_key: str
	year: int
	month: int
	value: float | int | str


class WeSaveForecastFormInput(TypedDict, total=False):
	"""Входные параметры we_save_forecast_changes."""

	project: str
	changes: str | list[WeSaveForecastChange]


# --- save_forecast_as_plan ---


class SaveForecastAsPlanItem(TypedDict, total=False):
	"""Одна запись из JSON data (save_forecast_as_plan)."""

	task: str
	role: str | None
	year: int | str
	month: int | str
	plan_value: float | str | int


class SaveForecastAsPlanFormInput(TypedDict, total=False):
	"""Входные параметры для save_forecast_as_plan."""

	project: str
	data: str


# --- calculate_timesheet_limits ---


class TimesheetPositionInput(TypedDict, total=False):
	"""Одна позиция UTP из JSON positions (calculate_timesheet_limits)."""

	name: str | None
	document_name: str | None
	project_role: str | None
	project: str | None
	status: str | None
	year: int | None
	month: int | None
	all_hours: float | str | int | None
	custom_username: str | None


class LimitControlRowInput(TypedDict, total=False):
	"""Строка child table Limit Control (override порогов с формы)."""

	type: str | None
	limit: float | str | int | None


class TimesheetLimitsFormInput(TypedDict, total=False):
	"""Входные параметры для calculate_timesheet_limits."""

	positions: str
	timesheet_name: str | None
	project_limits: str | None


class PlanSource(TypedDict, total=False):
	"""Откуда часы плана: клетка предка или дети узла сборки."""

	task_name: str
	subject: str
	planned_hours: float


class HoursData(TypedDict, total=False):
	"""Агрегированные часы UTP: total, users, user_hours и доли по status."""

	total: float
	users: set[str]
	user_hours: dict[str, dict[str, float]]


LimitStatus = Literal["no-plan", "block", "warning", "message", "normal"]


class TimesheetLimitResult(TypedDict, total=False):
	"""Результат расчёта лимита для одной позиции UTP."""

	project: str | None
	position: str | None
	document_name: str
	role: str
	planned_hours: float
	total_hours: float
	hours_data: HoursData
	completion_percentage: int
	status: LimitStatus
	limit: int | float
	used_parent_for_plan: bool
	used_children_for_actual: bool
	child_tasks_count: int
	task_subject: str
	plan_required: bool
	plan_task_subject: str
	plan_sources: list[PlanSource]
	has_linked_issue: bool | None
	root_task_with_issue: str | None


TimesheetLimitsResponse = list[TimesheetLimitResult]


# --- get_work_efforts_progress ---


class WorkEffortsProgressResponse(TypedDict, total=False):
	"""Scalars for Project Details «Трудозатраты» bar."""

	plan_hours: float
	fact_hours: float
	percent: float
