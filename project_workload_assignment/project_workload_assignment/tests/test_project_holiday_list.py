# Copyright (c) 2026, Dinext
"""ISS-2026-02657: календарь строки проекта = Project HL, иначе Company."""

from __future__ import annotations

from frappe.tests.utils import FrappeTestCase

from project_workload_assignment.project_workload_assignment.project_workload.canonical.reshape import (
	_adapt_project_row,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.context_loaders import (
	resolve_project_holiday_list,
)


class TestProjectHolidayList(FrappeTestCase):
	def test_resolve_prefers_project_holiday_list(self):
		self.assertEqual(
			resolve_project_holiday_list(
				{"holiday_list": "HL-P", "company": "C", "effective_holiday_list": "HL-C"},
				{"C": "HL-C"},
			),
			"HL-P",
		)

	def test_resolve_company_fallback(self):
		self.assertEqual(
			resolve_project_holiday_list(
				{"holiday_list": None, "company": "C"},
				{"C": "HL-C"},
			),
			"HL-C",
		)

	def test_resolve_effective_when_company_map_missing(self):
		self.assertEqual(
			resolve_project_holiday_list(
				{
					"holiday_list": None,
					"company": "C",
					"effective_holiday_list": "HL-C",
				}
			),
			"HL-C",
		)

	def test_resolve_empty(self):
		self.assertIsNone(resolve_project_holiday_list(None))
		self.assertIsNone(resolve_project_holiday_list({"holiday_list": None, "company": "C"}))

	def test_adapt_project_row_drops_user_holidays(self):
		legacy = {
			"_project": "PRJ-1",
			"_email": "a@x",
			"project": "Demo",
			"_userHolidays": [{"date": "2026-08-29", "description": "User"}],
			"_projectHolidays": [{"date": "2026-08-30", "description": "Project"}],
		}
		row = _adapt_project_row(legacy, [], "a@x")
		self.assertEqual(row["kind"], "project")
		self.assertEqual(row["projectHolidays"], [{"date": "2026-08-30", "description": "Project"}])
		self.assertNotIn("userHolidays", row)
