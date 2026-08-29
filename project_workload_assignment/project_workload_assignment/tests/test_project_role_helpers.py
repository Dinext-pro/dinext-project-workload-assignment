# Copyright (c) 2026, Dinext
"""Unit tests for project role filter helpers (ISS-2026-02657)."""

from __future__ import annotations

from frappe.tests.utils import FrappeTestCase

from project_workload_assignment.project_workload_assignment.project_workload.core.project_role_helpers import (
	filter_assignments_by_project_role,
	normalize_project_role_filters,
)


class TestProjectRoleHelpers(FrappeTestCase):
	def test_normalize_empty_means_all(self):
		self.assertEqual(normalize_project_role_filters(None), [])
		self.assertEqual(normalize_project_role_filters(""), [])
		self.assertEqual(normalize_project_role_filters([]), [])
		self.assertEqual(normalize_project_role_filters("all"), [])
		self.assertEqual(normalize_project_role_filters("все"), [])

	def test_normalize_list_and_json(self):
		self.assertEqual(
			normalize_project_role_filters(["Developer", "Analyst", "Developer"]),
			["Developer", "Analyst"],
		)
		self.assertEqual(
			normalize_project_role_filters('["Developer","Analyst"]'),
			["Developer", "Analyst"],
		)
		self.assertEqual(
			normalize_project_role_filters("Developer, Analyst"),
			["Developer", "Analyst"],
		)

	def test_filter_assignments(self):
		rows = [
			{"role": "Developer", "user": "a@x"},
			{"role": "Analyst", "user": "b@x"},
			{"role": None, "user": "c@x"},
		]
		self.assertEqual(filter_assignments_by_project_role(rows, []), rows)
		self.assertEqual(
			filter_assignments_by_project_role(rows, ["Developer"]),
			[{"role": "Developer", "user": "a@x"}],
		)
