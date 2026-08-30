# Copyright (c) 2026, Dinext
"""Unit tests for ISS-2026-00002 chart aggregates."""

from __future__ import annotations

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import getdate

from project_workload_assignment.api import (
	pwr_run_project_workload_charts,
	pwr_run_team_workload_charts,
)
from project_workload_assignment.project_workload_assignment.project_workload.team_report.chart_aggregates import (
	_compute_workload_by_role,
	_fetch_team_assignments,
	_normalize_worker_wtype_filter,
	_zero_series,
	_zero_wtype_series,
	run_get_project_workload_charts,
	run_get_team_workload_charts,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.periods import (
	build_date_to_period_key,
	generate_periods_for_project_window,
	generate_periods_for_pwr_report,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.windows import (
	compute_assignment_sql_lower_bound,
	get_visible_window,
)


def _stack_total(bucket):
	return round(
		sum(float(hours or 0) for series in (bucket or {}).values() for hours in series),
		6,
	)


class _FakeWorkloadCtx:
	def compute_assignment_daily_hours(self, assignment):
		return assignment.get("_daily") or {}


class TestChartAggregates(FrappeTestCase):
	def test_normalize_worker_wtype_filter(self):
		self.assertIsNone(_normalize_worker_wtype_filter(None))
		self.assertIsNone(_normalize_worker_wtype_filter(""))
		self.assertIsNone(_normalize_worker_wtype_filter("all"))
		self.assertIsNone(_normalize_worker_wtype_filter("все"))
		self.assertEqual(_normalize_worker_wtype_filter("Employee"), "Employee")
		self.assertEqual(_normalize_worker_wtype_filter("Supplier"), "Supplier")
		self.assertIsNone(_normalize_worker_wtype_filter("Unknown"))

	def test_compute_workload_by_role_buckets_empty_and_named(self):
		periods = generate_periods_for_pwr_report("daily", "quarter", "2026-06-01")
		date_to_period_key = build_date_to_period_key(periods, "daily")
		period_index = {period["key"]: i for i, period in enumerate(periods)}
		day = periods[0]["date"]
		assignments = [
			{"user": "a@example.com", "role": "SA", "_daily": {day: 2.0}},
			{"user": "b@example.com", "role": "  ", "_daily": {day: 1.0}},
			{"user": "c@example.com", "role": "SA", "_daily": {day: 3.0}},
		]

		result = _compute_workload_by_role(
			assignments,
			_FakeWorkloadCtx(),
			periods,
			date_to_period_key,
			period_index,
		)

		self.assertEqual(result["SA"][0], 5.0)
		self.assertEqual(result[""][0], 1.0)
		self.assertEqual(len(result["SA"]), len(periods))

	def test_zero_series_helpers(self):
		self.assertEqual(_zero_series(3), [0.0, 0.0, 0.0])
		wtype_series = _zero_wtype_series(2)
		self.assertEqual(set(wtype_series.keys()), {"Employee", "Supplier"})
		self.assertEqual(wtype_series["Employee"], [0.0, 0.0])

	def test_team_charts_empty_filters_returns_periods(self):
		result = run_get_team_workload_charts(
			{"view_type": "weekly", "period_range": "quarter", "worker_wtype": "all"}
		)
		self.assertIn("periods", result)
		self.assertGreater(len(result["periods"]), 0)
		self.assertIn("series", result)
		self.assertEqual(len(result["series"]["capacity_hours"]), len(result["periods"]))
		self.assertIn("workload_forecast_hours_by_role", result["series"])
		self.assertEqual(
			_stack_total(result["series"].get("workload_forecast_hours_by_wtype")),
			_stack_total(result["series"].get("workload_forecast_hours_by_role")),
		)

	def test_project_charts_requires_project(self):
		frappe.form_dict = frappe._dict({})
		result = pwr_run_project_workload_charts()
		self.assertEqual(result.get("message"), "No project specified")

	def test_generate_periods_for_project_window_daily(self):
		periods = generate_periods_for_project_window("2026-06-01", "2026-06-03", "daily")
		self.assertEqual(len(periods), 3)
		self.assertEqual(periods[0]["date"], "2026-06-01")

	def test_generate_periods_for_pwr_report_anchor(self):
		periods = generate_periods_for_pwr_report("daily", "quarter", "2026-01-15")
		self.assertEqual(len(periods), 90)
		self.assertEqual(periods[0]["date"], "2026-01-15")

	def test_team_charts_load_utilization_flag(self):
		result = run_get_team_workload_charts(
			{
				"view_type": "weekly",
				"period_range": "quarter",
				"period_anchor_date": "2026-01-15",
				"load_utilization": 1,
			}
		)
		self.assertIn("periods", result)
		self.assertFalse(result.get("error"), result.get("error"))
		self.assertTrue(result.get("meta", {}).get("utilization_loaded"))
		series = result.get("series") or {}
		period_count = len(result["periods"])
		self.assertEqual(len(series.get("utilization_plan_hours") or []), period_count)
		self.assertEqual(len(series.get("utilization_forecast_hours") or []), period_count)
		# utilization_forecast ≠ sum stacked (Employee+Supplier); см. iss_2026_00002_utilization_charts.

	def test_team_charts_load_utilization_actual_when_both_flags(self):
		result = run_get_team_workload_charts(
			{
				"view_type": "weekly",
				"period_range": "quarter",
				"period_anchor_date": "2026-01-15",
				"load_utilization": 1,
				"load_actual": 1,
			}
		)
		self.assertFalse(result.get("error"), result.get("error"))
		self.assertTrue(result.get("meta", {}).get("utilization_loaded"))
		self.assertTrue(result.get("meta", {}).get("actual_loaded"))
		series = result.get("series") or {}
		period_count = len(result["periods"])
		self.assertEqual(len(series.get("utilization_actual_hours") or []), period_count)
		self.assertIn("actual_hours_by_wtype", series)
		self.assertIn("actual_hours_by_role", series)
		self.assertEqual(
			_stack_total(series.get("actual_hours_by_wtype")),
			_stack_total(series.get("actual_hours_by_role")),
		)
		self.assertEqual(
			_stack_total(series.get("workload_forecast_hours_by_wtype")),
			_stack_total(series.get("workload_forecast_hours_by_role")),
		)

	def test_team_charts_skips_utilization_actual_without_show_fact(self):
		result = run_get_team_workload_charts(
			{
				"view_type": "weekly",
				"period_range": "quarter",
				"period_anchor_date": "2026-01-15",
				"load_utilization": 1,
				"load_actual": 0,
			}
		)
		series = result.get("series") or {}
		self.assertNotIn("utilization_actual_hours", series)

	def test_team_charts_load_actual_flag(self):
		result = run_get_team_workload_charts(
			{
				"view_type": "weekly",
				"period_range": "quarter",
				"period_anchor_date": "2026-01-15",
				"load_actual": 0,
			}
		)
		self.assertIn("periods", result)
		self.assertFalse(result.get("meta", {}).get("actual_loaded"))

		frappe.form_dict = frappe._dict(
			{"view_type": "monthly", "period_range": "quarter", "worker_wtype": ""}
		)
		result = pwr_run_team_workload_charts()
		self.assertIn("periods", result)
		self.assertFalse(result.get("error"))

	def test_project_charts_load_actual_flag(self):
		project = frappe.db.get_value("Project", {}, "name")
		if not project:
			self.skipTest("No Project on site")

		result = run_get_project_workload_charts(
			{
				"project": project,
				"view_type": "weekly",
				"date_from": "2026-03-01",
				"date_to": "2026-06-30",
				"load_actual": 1,
			}
		)
		self.assertFalse(result.get("error"), result.get("error"))
		self.assertTrue(result.get("meta", {}).get("actual_loaded"))
		self.assertIn("actual_hours_by_wtype", result.get("series") or {})
		self.assertIn("actual_hours_by_role", result.get("series") or {})
		self.assertEqual(
			_stack_total((result.get("series") or {}).get("actual_hours_by_wtype")),
			_stack_total((result.get("series") or {}).get("actual_hours_by_role")),
		)

	@patch(
		"project_workload_assignment.project_workload_assignment.project_workload.core.context_loaders.filter_assignments_by_permitted_workers",
		side_effect=lambda rows: rows,
	)
	@patch(
		"project_workload_assignment.project_workload_assignment.project_workload.core.assignments.fetch_pwr_report_assignments",
		return_value=[],
	)
	def test_team_chart_actual_window_uses_display_start(self, mock_fetch, _perm):
		fd = {
			"view_type": "weekly",
			"period_range": "quarter",
			"period_anchor_date": "2026-01-15",
			"worker_wtype": "Employee",
			"project_role_filters": ["Developer"],
		}
		periods = generate_periods_for_pwr_report("weekly", "quarter", "2026-01-15")
		display_start, display_end = get_visible_window(periods, "weekly")
		self.assertLess(getdate(display_start), getdate())

		_fetch_team_assignments(fd, for_actual=False)
		_fetch_team_assignments(fd, for_actual=True)

		self.assertEqual(mock_fetch.call_count, 2)
		forecast_call, actual_call = mock_fetch.call_args_list
		self.assertEqual(forecast_call.args[0], getdate(compute_assignment_sql_lower_bound(display_start)))
		self.assertEqual(forecast_call.args[1], getdate(display_end))
		self.assertEqual(actual_call.args[0], getdate(display_start))
		self.assertEqual(actual_call.args[1], getdate(display_end))
		self.assertEqual(actual_call.kwargs.get("worker_wtype_filter"), "Employee")
		self.assertEqual(actual_call.kwargs.get("project_role_filters"), ["Developer"])

	@patch(
		"project_workload_assignment.project_workload_assignment.project_workload.core.context_loaders.filter_assignments_by_permitted_workers",
		side_effect=lambda rows: rows,
	)
	@patch(
		"project_workload_assignment.project_workload_assignment.project_workload.core.assignments.fetch_pwr_report_assignments",
		return_value=[],
	)
	def test_team_charts_load_actual_refetches_past_assignments(self, mock_fetch, _perm):
		run_get_team_workload_charts(
			{
				"view_type": "weekly",
				"period_range": "quarter",
				"period_anchor_date": "2026-01-15",
				"load_actual": 1,
			}
		)
		self.assertGreaterEqual(mock_fetch.call_count, 2)
		periods = generate_periods_for_pwr_report("weekly", "quarter", "2026-01-15")
		display_start, _ = get_visible_window(periods, "weekly")
		starts = [call.args[0] for call in mock_fetch.call_args_list]
		self.assertIn(getdate(display_start), starts)
		self.assertIn(getdate(compute_assignment_sql_lower_bound(display_start)), starts)
