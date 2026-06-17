# Copyright (c) 2026, Dinext
"""Unit tests for ISS-2026-00002 chart aggregates."""

from __future__ import annotations

import frappe
from frappe.tests.utils import FrappeTestCase

from project_workload_assignment.project_workload_api import (
	pwr_run_project_workload_charts,
	pwr_run_team_workload_charts,
)
from project_workload_assignment.project_workload_assignment.project_workload.chart_aggregates import (
	_normalize_worker_wtype_filter,
	_zero_series,
	_zero_wtype_series,
	run_get_team_workload_charts,
)
from project_workload_assignment.project_workload_assignment.project_workload.periods import (
	generate_periods_for_project_window,
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

	def test_whitelist_team_charts_entrypoint(self):
		frappe.form_dict = frappe._dict(
			{"view_type": "monthly", "period_range": "quarter", "worker_wtype": ""}
		)
		result = pwr_run_team_workload_charts()
		self.assertIn("periods", result)
		self.assertFalse(result.get("error"))
