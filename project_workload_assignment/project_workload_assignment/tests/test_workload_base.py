# Copyright (c) 2026, Dinext
"""Unit tests for ISS-2026-03483 workload_base helpers (no DB)."""

import unittest
from unittest.mock import patch

from project_workload_assignment.project_workload_assignment.project_workload.core.workload_base import (
	HOURS_KEY_EXPECTED,
	HOURS_KEY_PLAN,
	WORKLOAD_BASE_BY_PROJECT,
	WORKLOAD_BASE_FORECAST,
	WORKLOAD_BASE_PLAN,
	hours_key_from_limits_base,
	hours_source_from_form,
	normalize_limits_base,
	normalize_report_workload_base,
	normalize_workload_base,
	site_default_limits_base,
	site_default_workload_base,
)


class TestWorkloadBase(unittest.TestCase):
	@patch(
		"project_workload_assignment.project_workload_assignment.project_workload.core.workload_base._client_config",
		return_value={},
	)
	def test_normalize_project_field(self, _cfg):
		self.assertEqual(normalize_workload_base("От плана"), WORKLOAD_BASE_PLAN)
		self.assertEqual(normalize_workload_base("От прогноза"), WORKLOAD_BASE_FORECAST)
		self.assertEqual(normalize_workload_base("По проекту"), WORKLOAD_BASE_PLAN)

	@patch(
		"project_workload_assignment.project_workload_assignment.project_workload.core.workload_base._client_config",
		return_value={},
	)
	def test_empty_uses_plan_without_site_config(self, _cfg):
		self.assertEqual(site_default_workload_base(), WORKLOAD_BASE_PLAN)
		self.assertEqual(normalize_workload_base(""), WORKLOAD_BASE_PLAN)
		self.assertEqual(normalize_workload_base(None), WORKLOAD_BASE_PLAN)

	@patch(
		"project_workload_assignment.project_workload_assignment.project_workload.core.workload_base._client_config",
		return_value={"workload_default_base": "От прогноза"},
	)
	def test_site_config_forecast_default(self, _cfg):
		self.assertEqual(site_default_workload_base(), WORKLOAD_BASE_FORECAST)
		self.assertEqual(normalize_workload_base(""), WORKLOAD_BASE_FORECAST)

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

	@patch(
		"project_workload_assignment.project_workload_assignment.project_workload.core.workload_base._client_config",
		return_value={},
	)
	def test_limits_default_plan(self, _cfg):
		self.assertEqual(site_default_limits_base(), WORKLOAD_BASE_PLAN)
		self.assertEqual(normalize_limits_base(""), WORKLOAD_BASE_PLAN)
		self.assertEqual(hours_key_from_limits_base(""), HOURS_KEY_PLAN)

	@patch(
		"project_workload_assignment.project_workload_assignment.project_workload.core.workload_base._client_config",
		return_value={"limits_default_base": "От прогноза"},
	)
	def test_limits_site_forecast(self, _cfg):
		self.assertEqual(site_default_limits_base(), WORKLOAD_BASE_FORECAST)
		self.assertEqual(normalize_limits_base(""), WORKLOAD_BASE_FORECAST)
		self.assertEqual(
			hours_key_from_limits_base("От прогноза"), HOURS_KEY_EXPECTED
		)
		self.assertEqual(hours_key_from_limits_base("От плана"), HOURS_KEY_PLAN)


if __name__ == "__main__":
	unittest.main()
