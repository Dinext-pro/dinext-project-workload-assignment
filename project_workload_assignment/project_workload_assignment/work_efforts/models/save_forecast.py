# Copyright (c) 2026, Dinext
"""TypedDict для we_save_forecast_changes (batch save из WE grid)."""

from __future__ import annotations

from typing import TypedDict


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
