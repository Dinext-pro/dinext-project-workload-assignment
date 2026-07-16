# Copyright (c) 2026, Dinext
"""TypedDict для consolidated_data (вход/ответ)."""

from __future__ import annotations

from typing import TypedDict


class ConsolidatedDataFormInput(TypedDict, total=False):
	"""Входные параметры для consolidated_data."""

	project: str


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
