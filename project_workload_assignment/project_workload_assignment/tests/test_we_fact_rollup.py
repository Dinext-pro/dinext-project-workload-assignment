# Copyright (c) 2026, Dinext
"""Unit tests: WE fact rollup does not inherit empty child roles."""

from __future__ import annotations

from frappe.tests.utils import FrappeTestCase

from project_workload_assignment.project_workload_assignment.work_efforts.consolidated_data import (
	rollup_fact_to_parents,
)


def _task(task_id: str, parent: str | None, indent: int, role_data: list) -> dict:
	return {
		"value": task_id,
		"parent_task": parent,
		"indent": indent,
		"role_data": role_data,
	}


class TestWeFactRollup(FrappeTestCase):
	def test_named_role_without_fact_does_not_appear_on_parent(self):
		tasks = {
			"P": _task("P", None, 0, []),
			"C": _task("C", "P", 1, [{"role": "Dev", "has_own_pwe": True, "plan_2026_1": 8}]),
		}
		rollup_fact_to_parents(tasks)
		self.assertEqual(tasks["P"]["role_data"], [])
		self.assertEqual(len(tasks["C"]["role_data"]), 1)

	def test_zero_fact_does_not_create_parent_role(self):
		tasks = {
			"P": _task("P", None, 0, []),
			"C": _task("C", "P", 1, [{"role": "Dev", "has_own_pwe": True, "fact_2026_1": 0}]),
		}
		rollup_fact_to_parents(tasks)
		self.assertEqual(tasks["P"]["role_data"], [])

	def test_utps_only_does_not_create_parent_role(self):
		tasks = {
			"P": _task("P", None, 0, []),
			"C": _task(
				"C",
				"P",
				1,
				[{"role": "Dev", "has_own_pwe": False, "fact_utps_2026_1": ["UTP-1"]}],
			),
		}
		rollup_fact_to_parents(tasks)
		self.assertEqual(tasks["P"]["role_data"], [])

	def test_positive_fact_creates_rollup_only_parent_row(self):
		tasks = {
			"P": _task("P", None, 0, []),
			"C": _task(
				"C",
				"P",
				1,
				[
					{
						"role": "Dev",
						"has_own_pwe": True,
						"plan_2026_1": 10,
						"forecast_2026_1": 4,
						"fact_2026_1": 5,
						"fact_utps_2026_1": ["UTP-1"],
					}
				],
			),
		}
		rollup_fact_to_parents(tasks)
		parent_roles = tasks["P"]["role_data"]
		self.assertEqual(len(parent_roles), 1)
		self.assertEqual(parent_roles[0]["role"], "Dev")
		self.assertFalse(parent_roles[0]["has_own_pwe"])
		self.assertEqual(parent_roles[0]["fact_2026_1"], 5)
		self.assertEqual(parent_roles[0]["fact_utps_2026_1"], ["UTP-1"])
		self.assertNotIn("plan_2026_1", parent_roles[0])
		self.assertNotIn("forecast_2026_1", parent_roles[0])

	def test_fact_adds_into_existing_parent_role(self):
		tasks = {
			"P": _task(
				"P",
				None,
				0,
				[{"role": "Dev", "has_own_pwe": True, "plan_2026_1": 3, "fact_2026_1": 1}],
			),
			"C": _task("C", "P", 1, [{"role": "Dev", "has_own_pwe": True, "fact_2026_1": 2}]),
		}
		rollup_fact_to_parents(tasks)
		parent = tasks["P"]["role_data"][0]
		self.assertTrue(parent["has_own_pwe"])
		self.assertEqual(parent["plan_2026_1"], 3)
		self.assertEqual(parent["fact_2026_1"], 3)

	def test_grandchild_fact_rolls_through_middle(self):
		tasks = {
			"P": _task("P", None, 0, []),
			"M": _task("M", "P", 1, []),
			"G": _task("G", "M", 2, [{"role": "QA", "has_own_pwe": True, "fact_2026_1": 8}]),
		}
		rollup_fact_to_parents(tasks)
		self.assertEqual(tasks["M"]["role_data"][0]["fact_2026_1"], 8)
		self.assertFalse(tasks["M"]["role_data"][0]["has_own_pwe"])
		self.assertEqual(tasks["P"]["role_data"][0]["fact_2026_1"], 8)
		self.assertFalse(tasks["P"]["role_data"][0]["has_own_pwe"])
