# Copyright (c) 2026, Dinext and contributors
"""Unit tests for pwa_dates (mocked Task/Issue sync + bulk helpers)."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from project_workload_assignment.pwa_dates.bulk import _current_pwa_users
from project_workload_assignment.pwa_dates.issue_sync import sync_issue_dates_to_pwa
from project_workload_assignment.pwa_dates.task_sync import sync_task_dates_to_pwa


class _Doc:
	def __init__(self, **kwargs):
		self.__dict__.update(kwargs)
		self.flags = kwargs.get("flags") or {}

	def get(self, key, default=None):
		return getattr(self, key, default)

	def get_doc_before_save(self):
		return self._old


class TestPwaBulkHelpers(unittest.TestCase):
	def test_current_pwa_users_ignores_remove(self):
		items = [
			{"task": "T1", "user": "a@x"},
			{"task": "T1", "user": "b@x", "__isRemove": True},
			{"task": "T2", "user": "c@x"},
		]
		self.assertEqual(_current_pwa_users("T1", items), {"a@x"})


class TestTaskSync(unittest.TestCase):
	@patch("project_workload_assignment.pwa_dates.task_sync.frappe.get_doc")
	@patch("project_workload_assignment.pwa_dates.task_sync.frappe.get_all")
	def test_exp_change_updates_pwa(self, get_all, get_doc):
		get_all.return_value = [{"name": "PWA-1"}]
		pwa = MagicMock()
		pwa.date_from = "2026-01-01"
		pwa.date_to = "2026-01-02"
		get_doc.return_value = pwa

		doc = _Doc(
			name="TASK-1",
			exp_start_date="2026-08-01",
			exp_end_date="2026-08-10",
			flags={},
		)
		doc._old = _Doc(exp_start_date="2026-07-01", exp_end_date="2026-07-10")

		sync_task_dates_to_pwa(doc)
		self.assertEqual(pwa.date_from, "2026-08-01")
		self.assertEqual(pwa.date_to, "2026-08-10")
		pwa.save.assert_called_once()

	@patch("project_workload_assignment.pwa_dates.task_sync.frappe.get_all")
	def test_no_change_skips(self, get_all):
		doc = _Doc(
			name="TASK-1",
			exp_start_date="2026-08-01",
			exp_end_date="2026-08-10",
			flags={},
		)
		doc._old = _Doc(exp_start_date="2026-08-01", exp_end_date="2026-08-10")
		sync_task_dates_to_pwa(doc)
		get_all.assert_not_called()

	@patch("project_workload_assignment.pwa_dates.task_sync.frappe.get_doc")
	@patch("project_workload_assignment.pwa_dates.task_sync.frappe.get_all")
	def test_force_sync_without_exp_diff(self, get_all, get_doc):
		get_all.return_value = [{"name": "PWA-1"}]
		pwa = MagicMock()
		pwa.date_from = "2026-01-01"
		pwa.date_to = "2026-01-02"
		get_doc.return_value = pwa

		doc = _Doc(
			name="TASK-1",
			exp_start_date="2026-08-01",
			exp_end_date="2026-08-10",
			flags={"task_dates_force_pwa_sync": True},
		)
		doc._old = _Doc(exp_start_date="2026-08-01", exp_end_date="2026-08-10")

		sync_task_dates_to_pwa(doc)
		self.assertEqual(pwa.date_from, "2026-08-01")
		pwa.save.assert_called_once()


class TestIssueSync(unittest.TestCase):
	@patch("project_workload_assignment.pwa_dates.issue_sync.frappe.db.get_value")
	def test_skips_when_virtual_exists(self, get_value):
		get_value.return_value = "TASK-VT"
		doc = _Doc(name="ISS-1", opening_date="2026-08-01")
		doc._old = _Doc(opening_date="2026-07-01")
		with patch(
			"project_workload_assignment.pwa_dates.issue_sync.frappe.get_all"
		) as get_all:
			sync_issue_dates_to_pwa(doc)
			get_all.assert_not_called()

	@patch("project_workload_assignment.pwa_dates.issue_sync.frappe.get_doc")
	@patch("project_workload_assignment.pwa_dates.issue_sync.frappe.get_all")
	@patch("project_workload_assignment.pwa_dates.issue_sync.frappe.db.get_value")
	def test_updates_linked_task_pwa(self, get_value, get_all, get_doc):
		get_value.return_value = None
		get_all.side_effect = [
			[{"name": "TASK-ORD"}],
			[{"name": "PWA-1"}],
		]
		pwa = MagicMock()
		pwa.date_from = "2026-01-01"
		pwa.date_to = "2026-01-02"
		get_doc.return_value = pwa

		doc = _Doc(
			name="ISS-1",
			opening_date="2026-08-01",
			custom_expected_resolution_date="2026-08-20",
		)
		doc._old = _Doc(
			opening_date="2026-07-01",
			custom_expected_resolution_date="2026-07-10",
		)

		sync_issue_dates_to_pwa(doc)
		self.assertEqual(pwa.date_from, "2026-08-01")
		self.assertEqual(pwa.date_to, "2026-08-20")
		pwa.save.assert_called_once()


if __name__ == "__main__":
	unittest.main()
