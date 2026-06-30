# Copyright (c) 2026, Dinext
"""Интеграционные тесты серий утилизации PWR charts (ISS-2026-00002)."""

from __future__ import annotations

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt

from project_workload_assignment.project_workload_assignment.project_workload.chart_aggregates import (
	run_get_team_workload_charts,
)

from .data_setup import (
	EXPECTED_STACKED_TOTAL,
	EXPECTED_UTIL_FORECAST,
	USER_A,
	USER_B,
	USER_C,
	WEEK_START,
	prepare_utilization_charts_case,
	reset_owned_data,
)


def _sum_series(values: list[float] | None) -> float:
	return sum(flt(v) for v in (values or []))


def _sum_workload_stacked(workload_by_wtype: dict[str, list[float]] | None) -> float:
	if not workload_by_wtype:
		return 0.0
	total = 0.0
	for wtype_series in workload_by_wtype.values():
		total += _sum_series(wtype_series)
	return total


def _period_index_for_week(periods: list[dict], week_start: str) -> int | None:
	target = frappe.utils.getdate(week_start)
	for idx, period in enumerate(periods):
		if period.get("date") == week_start:
			return idx
		start = period.get("start_date")
		end = period.get("end_date")
		if start and end:
			if frappe.utils.getdate(start) <= target <= frappe.utils.getdate(end):
				return idx
	return None


def _chart_fd(
	*,
	user_group: str,
	user: str | None = None,
	view_type: str = "weekly",
) -> dict:
	return {
		"view_type": view_type,
		"period_range": "quarter",
		"period_anchor_date": WEEK_START,
		"user_group": user_group,
		"user": user,
		"load_utilization": 1,
	}


class TestISS202600002UtilizationCharts(FrappeTestCase):
	def _run_charts(self, ctx: dict, *, user: str | None = None, view_type: str = "weekly"):
		frappe.set_user("Administrator")
		with patch.object(frappe.utils, "nowdate", return_value=WEEK_START):
			result = run_get_team_workload_charts(
				_chart_fd(user_group=ctx["user_group"], user=user, view_type=view_type)
			)
		self.assertFalse(result.get("error"), result.get("error"))
		self.assertTrue(result.get("meta", {}).get("utilization_loaded"))
		return result

	def test_utilization_forecast_counts_only_eligible_comm_hours(self):
		"""Прогноз утилизации ≈ 40 ч (A→COMM), не 90 ч суммы stacked."""
		ctx = prepare_utilization_charts_case()
		result = self._run_charts(ctx)
		series = result.get("series") or {}
		periods = result.get("periods") or []
		idx = _period_index_for_week(periods, WEEK_START)
		self.assertIsNotNone(idx, "Нет периода на WEEK_START в ответе charts")

		forecast_total = _sum_series(series.get("utilization_forecast_hours"))
		forecast_week = flt((series.get("utilization_forecast_hours") or [])[idx])
		stacked_total = _sum_workload_stacked(series.get("workload_forecast_hours_by_wtype"))

		self.assertAlmostEqual(
			forecast_week,
			float(ctx["expected_util_forecast"]),
			delta=1.5,
			msg=f"util forecast week={forecast_week}, expected≈{EXPECTED_UTIL_FORECAST}",
		)
		self.assertNotAlmostEqual(
			forecast_week,
			float(ctx["expected_stacked_total"]),
			delta=5.0,
			msg="Прогноз утилизации не должен равняться сумме всех PWA (90 ч)",
		)
		self.assertAlmostEqual(
			stacked_total,
			float(ctx["expected_stacked_total"]),
			delta=2.0,
			msg=f"stacked total={stacked_total}, expected≈{EXPECTED_STACKED_TOTAL}",
		)
		self.assertGreater(forecast_total, 0.0)

	def test_utilization_plan_positive_for_eligible_zero_for_ineligible_users(self):
		"""План утилизации > 0 только у Employee A с %; B и C дают 0 при фильтре по user."""
		ctx = prepare_utilization_charts_case()
		result_a = self._run_charts(ctx, user=USER_A)
		result_b = self._run_charts(ctx, user=USER_B)
		result_c = self._run_charts(ctx, user=USER_C)

		plan_a = _sum_series((result_a.get("series") or {}).get("utilization_plan_hours"))
		plan_b = _sum_series((result_b.get("series") or {}).get("utilization_plan_hours"))
		plan_c = _sum_series((result_c.get("series") or {}).get("utilization_plan_hours"))

		self.assertGreater(plan_a, 0.5, msg="Employee A с util% должен давать план > 0")
		self.assertLess(plan_b, 0.01, msg="Employee B без util table — план 0")
		self.assertLess(plan_c, 0.01, msg="Supplier C — план 0")

	def test_stacked_workload_includes_all_wtypes(self):
		"""Stacked прогноз по wtype по-прежнему суммирует Employee + Supplier (~90 ч)."""
		ctx = prepare_utilization_charts_case()
		result = self._run_charts(ctx)
		series = result.get("series") or {}
		by_wtype = series.get("workload_forecast_hours_by_wtype") or {}
		employee_total = _sum_series(by_wtype.get("Employee"))
		supplier_total = _sum_series(by_wtype.get("Supplier"))

		self.assertAlmostEqual(employee_total, 60.0, delta=2.0)
		self.assertAlmostEqual(supplier_total, 30.0, delta=2.0)
		self.assertAlmostEqual(
			employee_total + supplier_total,
			float(ctx["expected_stacked_total"]),
			delta=2.5,
		)

	def test_worker_outside_wvalid_zeros_util_series_but_stacked_unchanged(self):
		"""Worker A вне wvalid: util plan/forecast = 0, stacked без изменений."""
		ctx = prepare_utilization_charts_case(wvalid_for_a="2026-05-31")
		result = self._run_charts(ctx)
		series = result.get("series") or {}
		util_forecast = _sum_series(series.get("utilization_forecast_hours"))
		util_plan = _sum_series(series.get("utilization_plan_hours"))
		stacked_total = _sum_workload_stacked(series.get("workload_forecast_hours_by_wtype"))

		self.assertLess(util_forecast, 0.01, msg="Вне wvalid — прогноз утилизации 0")
		self.assertLess(util_plan, 0.01, msg="Вне wvalid — план утилизации 0")
		self.assertAlmostEqual(
			stacked_total,
			float(ctx["expected_stacked_total"]),
			delta=2.5,
			msg="Stacked не зависит от wvalid",
		)


def reset():
	reset_owned_data()
