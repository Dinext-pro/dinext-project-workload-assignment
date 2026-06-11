# Copyright (c) 2026, Dinext
"""Общие TypedDict для расчёта Project Workload."""

from __future__ import annotations

from typing import TypedDict
from datetime import date


class AbsenceEntry(TypedDict, total=False):
	"""Запись отсутствия Application For Leave."""
	from_date: date | str
	to_date: date | str
	type: str | None
	alfrom_hours: float | None
	alto_hours: float | None


class HolidayEntry(TypedDict, total=False):
	"""Элемент календаря праздников."""
	date: str
	description: str | None
	weekly_off: bool | None


class UserWorkloadInfo(TypedDict, total=False):
	"""Пользователь + Worker + Timesheet Template для расчёта нагрузки."""
	name: str
	full_name: str | None
	user_image: str | None
	email: str | None
	wholiday_list: str | None
	wtimesheet_template: str | None
	hours_on_date: float | None
	tt_working_hours_on_date: str | None


class ProjectWorkloadInfo(TypedDict, total=False):
	"""Проект для расчёта нагрузки."""
	name: str
	project_name: str | None
	holiday_list: str | None


class TaskWorkloadInfo(TypedDict, total=False):
	"""Задача для отображения в плоском отчёте."""
	name: str
	subject: str | None


class WorkloadAssignmentInput(TypedDict, total=False):
	"""Минимальный набор полей назначения для движка расчёта."""
	task: str
	role: str | None
	user: str
	date_from: date | str
	date_to: date | str
	workload: str | None
	wl_value: float | None
	project_name: str
	project: str


WORKLOAD_FIXED_HOURS = "В рабочих часах"
WORKLOAD_PERCENT_FUND = "В % от фонда рабочих часов"
WORKLOAD_PERCENT_TASK = "В % от трудоемкости задачи"

DEFAULT_HOURS_ON_DATE = 8.0
