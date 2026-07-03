# Copyright (c) 2026, Dinext
"""Unit tests for PWR utilization helpers (ISS-2026-00002, этап 1–2)."""

from __future__ import annotations

from frappe.tests.utils import FrappeTestCase

from project_workload_assignment.project_workload_assignment.project_workload.core.types import (
	UserWorkloadInfo,
)
from project_workload_assignment.project_workload_assignment.project_workload.utilization.utilization_helpers import (
	is_utilization_eligible_worker,
	is_worker_active_on_date,
	project_util_included_on_date,
	worker_utilization_pct_on_date,
)


class TestUtilizationHelpers(FrappeTestCase):
	def test_is_worker_active_within_validity_period(self):
		self.assertTrue(
			is_worker_active_on_date("2026-01-01", "2026-12-31", "2026-06-15")
		)

	def test_is_worker_inactive_before_wvalid_from(self):
		self.assertFalse(
			is_worker_active_on_date("2026-06-01", "2026-12-31", "2026-05-31")
		)

	def test_is_worker_inactive_after_wvalid_for(self):
		self.assertFalse(
			is_worker_active_on_date("2026-01-01", "2026-06-30", "2026-07-01")
		)

	def test_is_worker_active_when_wvalid_for_null(self):
		self.assertTrue(
			is_worker_active_on_date("2026-01-01", None, "2030-01-01")
		)

	def test_is_worker_inactive_without_wvalid_from(self):
		self.assertFalse(is_worker_active_on_date(None, None, "2026-06-01"))

	def test_worker_utilization_pct_picks_latest_row_on_date(self):
		util_map = {
			"emp@example.com": [
				{"util_valid_from": "2026-01-01", "utilization": 50.0},
				{"util_valid_from": "2026-06-01", "utilization": 80.0},
			],
		}
		self.assertEqual(
			worker_utilization_pct_on_date("emp@example.com", "2026-06-15", util_map),
			80.0,
		)
		self.assertEqual(
			worker_utilization_pct_on_date("emp@example.com", "2026-05-15", util_map),
			50.0,
		)

	def test_worker_utilization_pct_none_when_no_rows(self):
		self.assertIsNone(
			worker_utilization_pct_on_date("emp@example.com", "2026-06-01", {})
		)

	def test_worker_utilization_pct_none_when_all_rows_in_future(self):
		util_map = {
			"emp@example.com": [
				{"util_valid_from": "2026-07-01", "utilization": 80.0},
			],
		}
		self.assertIsNone(
			worker_utilization_pct_on_date("emp@example.com", "2026-06-01", util_map)
		)

	def test_project_util_included_yes_on_date(self):
		project_map = {
			"PRJ-1": [
				{"pu_valid_from": "2026-01-01", "pu_included": "Да"},
			],
		}
		self.assertTrue(
			project_util_included_on_date("PRJ-1", "2026-06-01", project_map)
		)

	def test_project_util_included_no_on_date(self):
		project_map = {
			"PRJ-1": [
				{"pu_valid_from": "2026-01-01", "pu_included": "Нет"},
			],
		}
		self.assertFalse(
			project_util_included_on_date("PRJ-1", "2026-06-01", project_map)
		)

	def test_project_util_included_false_when_table_empty(self):
		self.assertFalse(
			project_util_included_on_date("PRJ-1", "2026-06-01", {})
		)

	def test_project_util_included_follows_date_change(self):
		project_map = {
			"PRJ-1": [
				{"pu_valid_from": "2026-01-01", "pu_included": "Нет"},
				{"pu_valid_from": "2026-06-01", "pu_included": "Да"},
			],
		}
		self.assertFalse(
			project_util_included_on_date("PRJ-1", "2026-05-15", project_map)
		)
		self.assertTrue(
			project_util_included_on_date("PRJ-1", "2026-06-15", project_map)
		)

	def test_is_utilization_eligible_employee_with_util(self):
		users_data = {
			"emp@example.com": UserWorkloadInfo(
				wtype="Employee",
				wvalid_from="2026-01-01",
				wvalid_for="2026-12-31",
			),
		}
		util_map = {
			"emp@example.com": [
				{"util_valid_from": "2026-01-01", "utilization": 75.0},
			],
		}
		self.assertTrue(
			is_utilization_eligible_worker(
				"emp@example.com",
				"2026-06-01",
				users_data,
				util_map,
				{},
			)
		)

	def test_is_utilization_eligible_false_for_supplier(self):
		users_data = {
			"sup@example.com": UserWorkloadInfo(
				wtype="Supplier",
				wvalid_from="2026-01-01",
			),
		}
		util_map = {
			"sup@example.com": [
				{"util_valid_from": "2026-01-01", "utilization": 75.0},
			],
		}
		self.assertFalse(
			is_utilization_eligible_worker(
				"sup@example.com",
				"2026-06-01",
				users_data,
				util_map,
				{"sup@example.com": "Supplier"},
			)
		)

	def test_is_utilization_eligible_true_when_wtype_empty_defaults_employee(self):
		users_data = {
			"emp@example.com": UserWorkloadInfo(
				wvalid_from="2026-01-01",
			),
		}
		util_map = {
			"emp@example.com": [
				{"util_valid_from": "2026-01-01", "utilization": 75.0},
			],
		}
		self.assertTrue(
			is_utilization_eligible_worker(
				"emp@example.com",
				"2026-06-01",
				users_data,
				util_map,
				{},
			)
		)

	def test_is_utilization_eligible_false_without_utilization(self):
		users_data = {
			"emp@example.com": UserWorkloadInfo(
				wtype="Employee",
				wvalid_from="2026-01-01",
			),
		}
		self.assertFalse(
			is_utilization_eligible_worker(
				"emp@example.com",
				"2026-06-01",
				users_data,
				{},
				{},
			)
		)

	def test_is_utilization_eligible_false_outside_validity(self):
		users_data = {
			"emp@example.com": UserWorkloadInfo(
				wtype="Employee",
				wvalid_from="2026-01-01",
				wvalid_for="2026-05-31",
			),
		}
		util_map = {
			"emp@example.com": [
				{"util_valid_from": "2026-01-01", "utilization": 75.0},
			],
		}
		self.assertFalse(
			is_utilization_eligible_worker(
				"emp@example.com",
				"2026-06-01",
				users_data,
				util_map,
				{},
			)
		)
