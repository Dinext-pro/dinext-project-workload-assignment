# Copyright (c) 2026, Dinext and contributors
"""Unit tests for client_config workload default view/period boot resolver."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from project_workload_assignment.boot import (
	extend_bootinfo,
	resolve_default_period_range,
	resolve_default_view_type,
)


class TestWorkloadDefaultViewType(unittest.TestCase):
	def test_missing_client_config_returns_none(self):
		with patch("project_workload_assignment.boot.frappe") as mock_frappe:
			mock_frappe.conf.get.return_value = None
			self.assertIsNone(resolve_default_view_type())

	def test_empty_client_config_returns_none(self):
		with patch("project_workload_assignment.boot.frappe") as mock_frappe:
			mock_frappe.conf.get.return_value = {}
			self.assertIsNone(resolve_default_view_type())

	def test_monthly_from_client_config(self):
		with patch("project_workload_assignment.boot.frappe") as mock_frappe:
			mock_frappe.conf.get.return_value = {"workload_default_view_type": "monthly"}
			self.assertEqual(resolve_default_view_type(), "monthly")

	def test_daily_case_insensitive(self):
		with patch("project_workload_assignment.boot.frappe") as mock_frappe:
			mock_frappe.conf.get.return_value = {"workload_default_view_type": " Daily "}
			self.assertEqual(resolve_default_view_type(), "daily")

	def test_invalid_value_returns_none(self):
		with patch("project_workload_assignment.boot.frappe") as mock_frappe:
			mock_frappe.conf.get.return_value = {"workload_default_view_type": "quarter"}
			self.assertIsNone(resolve_default_view_type())

	def test_extend_bootinfo_exposes_configured_value(self):
		boot = SimpleNamespace()
		with patch("project_workload_assignment.boot.frappe") as mock_frappe:
			mock_frappe.conf.get.return_value = {"workload_default_view_type": "weekly"}
			extend_bootinfo(boot)
		self.assertEqual(boot.workload_default_view_type, "weekly")
		self.assertIsNone(boot.workload_default_period_range)

	def test_extend_bootinfo_omits_when_unset(self):
		boot = SimpleNamespace()
		with patch("project_workload_assignment.boot.frappe") as mock_frappe:
			mock_frappe.conf.get.return_value = None
			extend_bootinfo(boot)
		self.assertIsNone(boot.workload_default_view_type)
		self.assertIsNone(boot.workload_default_period_range)


class TestWorkloadDefaultPeriodRange(unittest.TestCase):
	def test_missing_client_config_returns_none(self):
		with patch("project_workload_assignment.boot.frappe") as mock_frappe:
			mock_frappe.conf.get.return_value = None
			self.assertIsNone(resolve_default_period_range())

	def test_year_from_client_config(self):
		with patch("project_workload_assignment.boot.frappe") as mock_frappe:
			mock_frappe.conf.get.return_value = {"workload_default_period_range": "year"}
			self.assertEqual(resolve_default_period_range(), "year")

	def test_half_year_case_insensitive(self):
		with patch("project_workload_assignment.boot.frappe") as mock_frappe:
			mock_frappe.conf.get.return_value = {"workload_default_period_range": " Half_Year "}
			self.assertEqual(resolve_default_period_range(), "half_year")

	def test_invalid_value_returns_none(self):
		with patch("project_workload_assignment.boot.frappe") as mock_frappe:
			mock_frappe.conf.get.return_value = {"workload_default_period_range": "month"}
			self.assertIsNone(resolve_default_period_range())

	def test_extend_bootinfo_exposes_both_keys(self):
		boot = SimpleNamespace()
		with patch("project_workload_assignment.boot.frappe") as mock_frappe:
			mock_frappe.conf.get.return_value = {
				"workload_default_view_type": "monthly",
				"workload_default_period_range": "half_year",
			}
			extend_bootinfo(boot)
		self.assertEqual(boot.workload_default_view_type, "monthly")
		self.assertEqual(boot.workload_default_period_range, "half_year")
