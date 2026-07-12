# Copyright (c) 2026, Dinext
"""TypedDict для Work Efforts grid v2 (scalar rows + periods)."""

from __future__ import annotations

from typing import Literal, TypedDict

ViewMode = Literal["forecast_and_fact", "forecast_only", "fact_only"]


class WeV2GridFormInput(TypedDict, total=False):
	"""Входные параметры get_work_efforts_grid_v2."""

	project: str
	period_type: str
	view_mode: ViewMode
	view_options: str
	include_plan: bool | str | int


class WeV2SaveForecastChange(TypedDict, total=False):
	"""Одно изменение прогноза из WE grid v2."""

	task_id: str
	role: str | None
	period_key: str
	year: int
	month: int
	value: float | int | str


class WeV2SaveForecastFormInput(TypedDict, total=False):
	"""Входные параметры we_v2_save_forecast_changes."""

	project: str
	changes: str | list[WeV2SaveForecastChange]


class WeV2DisplayPeriod(TypedDict):
	"""Период отображения (месяц)."""

	year: int
	month: int
	key: str
	is_past: bool


class WeV2Row(TypedDict, total=False):
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


class WeV2GridResponse(TypedDict):
	"""Ответ get_work_efforts_grid_v2."""

	project: str
	period_type: str
	view_mode: ViewMode
	periods: list[WeV2DisplayPeriod]
	rows: list[WeV2Row]
	summary_rows: list[WeV2Row]
