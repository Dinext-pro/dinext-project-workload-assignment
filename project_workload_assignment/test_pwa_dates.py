# Copyright (c) 2026, Dinext and contributors
"""Unit tests for pwa_dates (pure helpers + mocked Task sync)."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from project_workload_assignment.pwa_dates.bulk import _current_pwa_users
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


if __name__ == "__main__":
	unittest.main()
