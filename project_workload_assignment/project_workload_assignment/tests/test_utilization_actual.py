# Copyright (c) 2026, Dinext
"""Unit tests for utilization actual chart series (ISS-2026-02657)."""

from __future__ import annotations

from unittest.mock import patch

from frappe.tests.utils import FrappeTestCase

from project_workload_assignment.project_workload_assignment.project_workload.core.periods import (
	build_date_to_period_key,
	generate_periods_for_pwr_report,
)
from project_workload_assignment.project_workload_assignment.project_workload.utilization.utilization_actual import (
	compute_team_utilization_actual_series,
)


class TestUtilizationActual(FrappeTestCase):
	@patch(
		"project_workload_assignment.project_workload_assignment.project_workload.utilization.utilization_actual.query_utp_daily_rows"
	)
	def test_utilization_actual_counts_only_eligible_pu_included_hours(self, mock_query):
		periods = generate_periods_for_pwr_report("weekly", "quarter", "2026-06-01")
		week_key = periods[0]["key"]
		date_str = periods[0]["start_date"]
		date_to_period_key = build_date_to_period_key(periods, "weekly")
		period_index = {p["key"]: i for i, p in enumerate(periods)}

		mock_query.return_value = [
			{
				"user": "user-a@example.com",
				"project": "PRJ-COMM",
				"task": "TASK-1",
				"date": date_str,
				"hours": 25.0,
			},
			{
				"user": "user-a@example.com",
				"project": "PRJ-INT",
				"task": "TASK-2",
				"date": date_str,
				"hours": 15.0,
			},
			{
				"user": "user-c@example.com",
				"project": "PRJ-COMM",
				"task": "TASK-3",
				"date": date_str,
				"hours": 10.0,
			},
		]

		assignments = [
			{"user": "user-a@example.com", "project_name": "PRJ-COMM"},
			{"user": "user-a@example.com", "project_name": "PRJ-INT"},
			{"user": "user-c@example.com", "project_name": "PRJ-COMM"},
		]
		users_data = {
			"user-a@example.com": {"wtype": "Employee"},
			"user-c@example.com": {"wtype": "Supplier"},
		}
		wtypes_map = {
			"user-a@example.com": "Employee",
			"user-c@example.com": "Supplier",
		}
		worker_utilization_map = {
			"user-a@example.com": [{"util_valid_from": "2026-01-01", "utilization": 80.0}],
			"user-c@example.com": [{"util_valid_from": "2026-01-01", "utilization": 80.0}],
		}
		project_utilization_map = {
			"PRJ-COMM": [{"pu_valid_from": "2026-01-01", "pu_included": "Да"}],
			"PRJ-INT": [{"pu_valid_from": "2026-01-01", "pu_included": "Нет"}],
		}

		with patch(
			"project_workload_assignment.project_workload_assignment.project_workload.utilization.utilization_actual.is_utilization_eligible_worker",
			side_effect=lambda user, *_args, **_kwargs: user == "user-a@example.com",
		):
			series = compute_team_utilization_actual_series(
				assignments,
				users_data,
				wtypes_map,
				worker_utilization_map,
				project_utilization_map,
				periods,
				"weekly",
				date_to_period_key,
				period_index,
			)

		idx = period_index[week_key]
		self.assertAlmostEqual(series[idx], 25.0, delta=0.01)
		self.assertAlmostEqual(sum(series), 25.0, delta=0.01)

	@patch(
		"project_workload_assignment.project_workload_assignment.project_workload.utilization.utilization_actual.query_utp_daily_rows"
	)
	def test_utilization_actual_returns_zeros_without_assignments(self, mock_query):
		periods = generate_periods_for_pwr_report("weekly", "quarter", "2026-06-01")
		date_to_period_key = build_date_to_period_key(periods, "weekly")
		period_index = {p["key"]: i for i, p in enumerate(periods)}

		series = compute_team_utilization_actual_series(
			[],
			{},
			{},
			{},
			{},
			periods,
			"weekly",
			date_to_period_key,
			period_index,
		)

		self.assertEqual(series, [0.0] * len(periods))
		mock_query.assert_not_called()
