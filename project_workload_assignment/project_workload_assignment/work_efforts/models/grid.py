# Copyright (c) 2026, Dinext
"""TypedDict для get_work_efforts_grid (periods + scalar rows)."""

from __future__ import annotations

from typing import Literal, TypedDict

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


class WeGridResponse(TypedDict):
	"""Ответ get_work_efforts_grid."""

	project: str
	period_type: str
	view_mode: ViewMode
	periods: list[WeDisplayPeriod]
	rows: list[WeRow]
	summary_rows: list[WeRow]
