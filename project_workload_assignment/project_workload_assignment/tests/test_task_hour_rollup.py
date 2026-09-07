# Copyright (c) 2026, Dinext
"""Unit tests: task plan hours roll up the full parent_task chain."""

from __future__ import annotations

from frappe.tests.utils import FrappeTestCase

from project_workload_assignment.project_workload_assignment.project_workload.project_report.task_hour_rollup import (
	period_map_has_hours,
	rollup_task_period_hours,
)


class TestTaskHourRollup(FrappeTestCase):
	def test_parent_sums_leaf_and_intermediate(self):
		# 123 → mid → leaf(8h). 123 has no own PWA.
		tasks = {
			"123": {"children": ["mid"], "parent_task_id": None},
			"mid": {"children": ["leaf"], "parent_task_id": "123"},
			"leaf": {"children": [], "parent_task_id": "mid"},
		}
		results = {"u_Dev_leaf": {"p1": 8.0}}
		memo = {}
		got = rollup_task_period_hours(
			"123",
			tasks_dict=tasks,
			task_results=results,
			user_email="u",
			role="Dev",
			period_keys=["p1"],
			memo=memo,
		)
		self.assertEqual(got["p1"], 8.0)
		self.assertEqual(memo["mid"]["p1"], 8.0)
		self.assertEqual(memo["leaf"]["p1"], 8.0)

	def test_parent_with_own_hours_adds_children(self):
		tasks = {
			"123": {"children": ["leaf"], "parent_task_id": None},
			"leaf": {"children": [], "parent_task_id": "123"},
		}
		results = {
			"u_Dev_123": {"p1": 2.0},
			"u_Dev_leaf": {"p1": 5.0},
		}
		got = rollup_task_period_hours(
			"123",
			tasks_dict=tasks,
			task_results=results,
			user_email="u",
			role="Dev",
			period_keys=["p1"],
		)
		self.assertEqual(got["p1"], 7.0)

	def test_other_role_not_included(self):
		tasks = {"123": {"children": ["leaf"]}, "leaf": {"children": []}}
		results = {"u_QA_leaf": {"p1": 9.0}}
		got = rollup_task_period_hours(
			"123",
			tasks_dict=tasks,
			task_results=results,
			user_email="u",
			role="Dev",
			period_keys=["p1"],
		)
		self.assertEqual(got["p1"], 0.0)

	def test_period_map_has_hours(self):
		self.assertFalse(period_map_has_hours(None))
		self.assertFalse(period_map_has_hours({"p1": 0, "p2": 0.0}))
		self.assertTrue(period_map_has_hours({"p1": 0, "p2": 1.5}))
