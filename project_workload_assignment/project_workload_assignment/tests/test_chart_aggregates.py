# Copyright (c) 2026, Dinext
"""Unit tests for ISS-2026-00002 chart aggregates."""

from __future__ import annotations

import frappe
from frappe.tests.utils import FrappeTestCase

from project_workload_assignment.project_workload_api import (
	pwr_run_project_workload_charts,
	pwr_run_team_workload_charts,
)
from project_workload_assignment.project_workload_assignment.project_workload.team_report.chart_aggregates import (
	_normalize_worker_wtype_filter,
	_zero_series,
	_zero_wtype_series,
	run_get_project_workload_charts,
	run_get_team_workload_charts,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.periods import (
	generate_periods_for_project_window,
	generate_periods_for_pwr_report,
)


class TestChartAggregates(FrappeTestCase):
	def test_normalize_worker_wtype_filter(self):
		self.assertIsNone(_normalize_worker_wtype_filter(None))
		self.assertIsNone(_normalize_worker_wtype_filter(""))
		self.assertIsNone(_normalize_worker_wtype_filter("all"))
		self.assertIsNone(_normalize_worker_wtype_filter("все"))
		self.assertEqual(_normalize_worker_wtype_filter("Employee"), "Employee")
		self.assertEqual(_normalize_worker_wtype_filter("Supplier"), "Supplier")
		self.assertIsNone(_normalize_worker_wtype_filter("Unknown"))

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
