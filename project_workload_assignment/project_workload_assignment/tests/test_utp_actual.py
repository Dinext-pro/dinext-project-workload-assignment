# Copyright (c) 2026, Dinext
"""Unit tests for UTP actual hours aggregation (ISS-2026-00709)."""

from __future__ import annotations

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from project_workload_assignment.project_workload_assignment.project_workload.core.periods import (
	build_date_to_period_key,
	generate_periods_for_pwr_report,
)
from project_workload_assignment.project_workload_assignment.project_workload.utilization.utp_actual import (
	compute_team_actual_hours,
	merge_user_actual_totals,
	query_utp_daily_rows,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.windows import (
	get_visible_window,
)


class TestUtpActual(FrappeTestCase):
	def test_build_date_to_period_key_maps_future_dates_in_weekly_view(self):
		periods = generate_periods_for_pwr_report("weekly", "quarter", "2026-06-01")
		date_map = build_date_to_period_key(periods, "weekly")
		future_date = periods[0]["end_date"]
		self.assertIn(future_date, date_map)
		self.assertEqual(date_map[future_date], periods[0]["key"])

	def test_visible_window_covers_full_period_range_not_today_only(self):
		periods = generate_periods_for_pwr_report("weekly", "quarter", "2026-01-01")
		start, end = get_visible_window(periods, "weekly")
		self.assertEqual(str(start), periods[0]["start_date"])
		self.assertEqual(str(end), periods[-1]["end_date"])
		self.assertLess(str(start), frappe.utils.nowdate())

	@patch(
		"project_workload_assignment.project_workload_assignment.project_workload.utilization.utp_actual.query_utp_daily_rows"
	)
	def test_compute_team_actual_hours_groups_by_project(self, mock_query):
		periods = generate_periods_for_pwr_report("weekly", "quarter", "2026-06-01")
		week_key = periods[0]["key"]
		mock_query.return_value = [
			{
				"user": "user@example.com",
				"project": "PRJ-1",
				"task": "TASK-1",
				"date": periods[0]["start_date"],
				"hours": 4.0,
			},
			{
				"user": "user@example.com",
				"project": "PRJ-2",
				"task": "TASK-2",
				"date": periods[0]["start_date"],
				"hours": 2.0,
			},
		]
		assignments = [
			{"user": "user@example.com", "project_name": "PRJ-1"},
			{"user": "user@example.com", "project_name": "PRJ-2"},
		]

		result = compute_team_actual_hours(assignments, periods, "weekly")

		self.assertEqual(result["user@example.com"]["PRJ-1"][week_key], 4.0)
		self.assertEqual(result["user@example.com"]["PRJ-2"][week_key], 2.0)

	@patch(
		"project_workload_assignment.project_workload_assignment.project_workload.utilization.utp_actual.query_utp_daily_rows"
	)
	def test_compute_team_actual_hours_includes_future_utp_in_period(self, mock_query):
		periods = generate_periods_for_pwr_report("daily", "quarter", "2026-06-01")
		future_period = periods[-1]
		mock_query.return_value = [
			{
				"user": "user@example.com",
				"project": "PRJ-1",
				"task": "TASK-1",
				"date": future_period["date"],
				"hours": 3.5,
			},
		]
		assignments = [{"user": "user@example.com", "project_name": "PRJ-1"}]

		result = compute_team_actual_hours(assignments, periods, "daily")

		self.assertEqual(
			result["user@example.com"]["PRJ-1"][future_period["key"]],
			3.5,
		)

	@patch(
		"project_workload_assignment.project_workload_assignment.project_workload.utilization.utp_actual.query_utp_daily_rows"
	)
	def test_compute_team_actual_hours_maps_past_utp_to_period(self, mock_query):
		periods = generate_periods_for_pwr_report("weekly", "quarter", "2026-01-01")
		past_period = periods[0]
		mock_query.return_value = [
			{
				"user": "user@example.com",
				"project": "PRJ-1",
				"task": "TASK-1",
				"date": past_period["start_date"],
				"hours": 6.0,
			},
		]
		assignments = [{"user": "user@example.com", "project_name": "PRJ-1"}]

		result = compute_team_actual_hours(assignments, periods, "weekly")

		self.assertEqual(
			result["user@example.com"]["PRJ-1"][past_period["key"]],
			6.0,
		)

	@patch(
		"project_workload_assignment.project_workload_assignment.project_workload.utilization.utp_actual.query_utp_daily_rows"
	)
	def test_compute_team_actual_hours_skips_pairs_outside_assignments(self, mock_query):
		periods = generate_periods_for_pwr_report("weekly", "quarter", "2026-06-01")
		week_key = periods[0]["key"]
		mock_query.return_value = [
			{
				"user": "user@example.com",
				"project": "PRJ-OTHER",
				"task": "TASK-1",
				"date": periods[0]["start_date"],
				"hours": 8.0,
			},
		]
		assignments = [{"user": "user@example.com", "project_name": "PRJ-1"}]

		result = compute_team_actual_hours(assignments, periods, "weekly")

		self.assertEqual(result, {})

	def test_merge_user_actual_totals_sums_projects(self):
		actual = {
			"user@example.com": {
				"PRJ-1": {"workload_w1": 4.0, "workload_w2": 1.0},
				"PRJ-2": {"workload_w1": 2.5},
			}
		}
		merged = merge_user_actual_totals(actual, "user@example.com")
		self.assertEqual(merged["workload_w1"], 6.5)
		self.assertEqual(merged["workload_w2"], 1.0)

	def test_query_utp_daily_rows_returns_empty_without_users(self):
		self.assertEqual(query_utp_daily_rows("2026-01-01", "2026-12-31", projects=["PRJ-1"]), [])
		self.assertEqual(
			query_utp_daily_rows("2026-01-01", "2026-12-31", projects=["PRJ-1"], users=[]),
			[],
		)
