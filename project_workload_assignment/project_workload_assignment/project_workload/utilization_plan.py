# Copyright (c) 2026, Dinext
"""Плановые часы утилизации команды (порт UT_Hours_Calculate_V4 для PWR charts)."""

from __future__ import annotations

from typing import TypedDict

import frappe
from frappe.utils import add_days, flt, getdate

from project_workload_assignment.project_workload_assignment.project_workload.periods import (
	PWRPeriod,
	build_date_to_period_key,
)
from project_workload_assignment.project_workload_assignment.project_workload.workload_engine import (
	WorkloadContext,
)

LEAVE_TYPE_EXCLUDED_FROM_UTIL = "Отгул"


class WorkerUtilizationRow(TypedDict):
	util_valid_from: str
	utilization: float


def _period_date_strings(periods: list[PWRPeriod], view_type: str) -> set[str]:
	dates: set[str] = set()
	for period in periods:
		if view_type == "daily":
			dates.add(period["date"])
		else:
			current_date = getdate(period["start_date"])
			end_date = getdate(period["end_date"])
			while current_date <= end_date:
				dates.add(str(current_date))
				current_date = add_days(current_date, 1)
	return dates


def _is_user_holiday(wl_ctx: WorkloadContext, user_email: str, date_str: str) -> bool:
	user_data = wl_ctx.users_data.get(user_email, {})
	holiday_list = user_data.get("wholiday_list")
	if holiday_list and holiday_list in wl_ctx.holiday_date_sets:
		return date_str in wl_ctx.holiday_date_sets[holiday_list]
	return False


def _absence_hours_for_day(wl_ctx: WorkloadContext, user_email: str, date_str: str) -> float:
	"""Сумма часов отсутствий на день, кроме типа «Отгул» (для расчёта planned_work)."""
	if user_email not in wl_ctx.user_absences:
		return 0.0

	scheduled = wl_ctx.get_base_hours(user_email, date_str)
	target_date = getdate(date_str)
	total = 0.0

	for absence in wl_ctx.user_absences[user_email]:
		if not (absence.get("from_date") and absence.get("to_date")):
			continue
		if absence.get("type") == LEAVE_TYPE_EXCLUDED_FROM_UTIL:
			continue

		from_date = getdate(absence["from_date"])
		to_date = getdate(absence["to_date"])
		if not (from_date <= target_date <= to_date):
			continue

		span = (to_date - from_date).days + 1
		offset = (target_date - from_date).days

		if offset == 0 and absence.get("alfrom_hours"):
			hrs = flt(absence["alfrom_hours"])
		elif offset == span - 1 and span > 1 and absence.get("alto_hours"):
			hrs = flt(absence["alto_hours"])
		else:
			hrs = scheduled

		total += hrs

	return total


def _utilization_pct_for_day(
	user_email: str,
	date_str: str,
	worker_utilization_map: dict[str, list[WorkerUtilizationRow]],
) -> float:
	util_rows = worker_utilization_map.get(user_email) or []
	target_date = getdate(date_str)
	valid_rows = [
		row
		for row in util_rows
		if row.get("util_valid_from") and getdate(row["util_valid_from"]) <= target_date
	]
	if not valid_rows:
		return 0.0
	latest = max(valid_rows, key=lambda row: getdate(row["util_valid_from"]))
	return flt(latest.get("utilization")) / 100.0


def compute_team_utilization_plan_series(
	wl_ctx: WorkloadContext,
	users_list: list[str],
	periods: list[PWRPeriod],
	view_type: str,
	worker_utilization_map: dict[str, list[WorkerUtilizationRow]],
) -> list[float]:
	"""Плановые часы утилизации по периодам для списка пользователей."""
	period_count = len(periods)
	if period_count == 0 or not users_list:
		return [0.0] * period_count

	period_index = {period["key"]: index for index, period in enumerate(periods)}
	date_to_period_key = build_date_to_period_key(periods, view_type)
	period_dates = _period_date_strings(periods, view_type)
	wl_ctx.preload_user_base_hours(users_list, period_dates)

	series = [0.0] * period_count
	for user_email in users_list:
		for date_str in period_dates:
			if _is_user_holiday(wl_ctx, user_email, date_str):
				continue

			scheduled = wl_ctx.get_base_hours(user_email, date_str)
			absence_hours = _absence_hours_for_day(wl_ctx, user_email, date_str)
			planned_work = max(0.0, scheduled - absence_hours)
			pct = _utilization_pct_for_day(user_email, date_str, worker_utilization_map)
			daily_plan = planned_work * pct

			period_key = date_to_period_key.get(date_str)
			if period_key is None:
				continue
			idx = period_index.get(period_key)
			if idx is None:
				continue
			series[idx] += daily_plan

	return series
