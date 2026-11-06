# Copyright (c) 2026, Dinext
"""Unit tests for ISS-2026-03483 workload_base helpers (no DB)."""

import unittest

from project_workload_assignment.project_workload_assignment.project_workload.core.workload_base import (
	WORKLOAD_BASE_BY_PROJECT,
	WORKLOAD_BASE_FORECAST,
	WORKLOAD_BASE_PLAN,
	hours_source_from_form,
	normalize_report_workload_base,
	normalize_workload_base,
)


class TestWorkloadBase(unittest.TestCase):
	def test_normalize_project_field(self):
		self.assertEqual(normalize_workload_base("От плана"), WORKLOAD_BASE_PLAN)
		self.assertEqual(normalize_workload_base("От прогноза"), WORKLOAD_BASE_FORECAST)
		self.assertEqual(normalize_workload_base(""), WORKLOAD_BASE_PLAN)
		self.assertEqual(normalize_workload_base("По проекту"), WORKLOAD_BASE_PLAN)

	def test_normalize_report(self):
		self.assertEqual(
			normalize_report_workload_base("По проекту"), WORKLOAD_BASE_BY_PROJECT
		)
		self.assertEqual(normalize_report_workload_base(""), WORKLOAD_BASE_BY_PROJECT)
		self.assertEqual(
			normalize_report_workload_base("От прогноза"), WORKLOAD_BASE_FORECAST
		)

	def test_from_form(self):
		self.assertEqual(
			hours_source_from_form({"workload_base": "По проекту"}),
			WORKLOAD_BASE_BY_PROJECT,
		)
		self.assertEqual(
			hours_source_from_form({"workload_base": "От прогноза"}),
			WORKLOAD_BASE_FORECAST,
		)
		self.assertEqual(hours_source_from_form({}), WORKLOAD_BASE_BY_PROJECT)
		self.assertEqual(hours_source_from_form(None), WORKLOAD_BASE_BY_PROJECT)


if __name__ == "__main__":
	unittest.main()
