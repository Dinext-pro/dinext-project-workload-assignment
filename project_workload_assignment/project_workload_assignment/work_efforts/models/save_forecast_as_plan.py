# Copyright (c) 2026, Dinext
"""TypedDict для save_forecast_as_plan."""

from __future__ import annotations

from typing import TypedDict


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
