# Copyright (c) 2026, Dinext
"""TypedDict для Work Efforts API (consolidated_data, timesheet_limits, save_forecast_as_plan)."""

from __future__ import annotations

from typing import Literal, TypedDict


# ==================== Входные параметры (frappe.form_dict) ====================


class ConsolidatedDataFormInput(TypedDict, total=False):
    """Входные параметры для consolidated_data."""

    project: str


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


# ==================== Ответ consolidated_data ====================


class WorkEffortRoleEntry(TypedDict, total=False):
    """Строка role_data; дополнительно plan_*, forecast_*, fact_*, fact_utps_* по периодам."""

    role: str


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


# ==================== Ответ timesheet_limits ====================


class PlanData(TypedDict, total=False):
    """Данные плана по задаче и роли."""

    task_name: str
    planned_hours: float
    subject: str


class HoursData(TypedDict, total=False):
    """Агрегированные часы UTP: total, users и доли по status."""

    total: float
    users: set[str]


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
    has_linked_issue: bool | None
    root_task_with_issue: str | None


TimesheetLimitsResponse = list[TimesheetLimitResult]
