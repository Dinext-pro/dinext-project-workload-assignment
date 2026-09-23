# Copyright (c) 2026, Dinext
"""Адаптер BulkData → экран. Без Frappe. Дерево Ивана как в test_plan_fact."""

from __future__ import annotations

import unittest

from project_workload_assignment.project_workload_assignment.plan_fact import Entry
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.bulk_loader import (
	TimesheetLimitsBulkData,
)
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.calculator import (
	TimesheetLimitsCalculator,
)
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.plan_fact_adapter import (
	TimesheetPlanFactAdapter,
)

PROJECT = "ISS-02105"
ROLE = "Dev"

USED = [
	Entry("t1", ROLE, 5),
	Entry("t1.1", ROLE, 15),
	Entry("t1.1.1", ROLE, 5),
	Entry("t1.1.2", ROLE, 10),
	Entry("t1.1.3", ROLE, 10),
]
BRANCH = frozenset({"t1", "t1.1", "t1.1.1", "t1.1.2", "t1.1.3"})


def _bulk() -> TimesheetLimitsBulkData:
	return TimesheetLimitsBulkData(
		task_meta={
			"t1": {"subject": "Задача 1", "parent_task": None},
			"t1.1": {"subject": "Подзадача 1.1", "parent_task": "t1"},
			"t1.1.1": {"subject": "Подзадача 1.1.1", "parent_task": "t1.1"},
			"t1.1.2": {"subject": "Подзадача 1.1.2", "parent_task": "t1.1"},
			"t1.1.3": {"subject": "Подзадача 1.1.3", "parent_task": "t1.1"},
		},
		children_map={
			(PROJECT, "t1"): ["t1.1"],
			(PROJECT, "t1.1"): ["t1.1.1", "t1.1.2", "t1.1.3"],
			(PROJECT, "t1.1.1"): [],
			(PROJECT, "t1.1.2"): [],
			(PROJECT, "t1.1.3"): [],
		},
		pwe_by_task_role={
			(PROJECT, "t1.1", ROLE): ["pwe-11"],
			(PROJECT, "t1.1.1", ROLE): ["pwe-111"],
			(PROJECT, "t1.1.2", ROLE): ["pwe-112"],
		},
		pwe_amounts={
			"pwe-11": [{"year": 2026, "month": 1, "plan": 10.0, "expected": 8.0}],
			"pwe-111": [
				{"year": 2026, "month": 1, "plan": 5.0, "expected": 4.0},
				{"year": 2026, "month": 2, "plan": 15.0, "expected": 12.0},
			],
			"pwe-112": [
				{"year": 2026, "month": 1, "plan": 5.0, "expected": 6.0},
				{"year": 2026, "month": 2, "plan": 20.0, "expected": 18.0},
			],
		},
	)


def _screen(task, year=None, month=None, used=()):
	return TimesheetPlanFactAdapter.for_screen(
		_bulk(), PROJECT, task, ROLE, year, month, used=used
	)


class TestAdapterIvanPlan(unittest.TestCase):
	def test_own_month_ignores_children(self):
		self.assertEqual(_screen("t1.1", 2026, 1).plan_hours, 10.0)

	def test_empty_month_sums_children(self):
		self.assertEqual(_screen("t1.1", 2026, 2).plan_hours, 35.0)

	def test_root_follows_child_tree(self):
		self.assertEqual(_screen("t1", 2026, 1).plan_hours, 10.0)
		self.assertEqual(_screen("t1", 2026, 2).plan_hours, 35.0)

	def test_folded_branch_is_45_not_flat_55(self):
		self.assertEqual(_screen("t1").plan_hours, 45.0)
		self.assertEqual(_screen("t1.1").plan_hours, 45.0)
		self.assertEqual(_screen("t1.1.3").plan_hours, 45.0)

	def test_own_plan_leaf_is_20(self):
		self.assertEqual(_screen("t1.1.1").plan_hours, 20.0)
		self.assertEqual(_screen("t1.1.1", 2026, 1).plan_hours, 5.0)
		self.assertEqual(_screen("t1.1.1", 2026, 2).plan_hours, 15.0)

	def test_month_without_plan_is_none(self):
		self.assertIsNone(_screen("t1.1", 2026, 3))
		self.assertIsNone(_screen("t1.1.3", 2026, 3))


class TestAdapterIvanFact(unittest.TestCase):
	def test_empty_leaf_eats_whole_branch(self):
		got = _screen("t1.1.3", used=USED)
		self.assertEqual(got.plan_hours, 45.0)
		self.assertEqual(got.fact_hours, 45.0)
		self.assertEqual(got.consumers, BRANCH)

	def test_parent_and_root_same_pot(self):
		for task in ("t1", "t1.1"):
			got = _screen(task, used=USED)
			self.assertEqual(got.plan_hours, 45.0)
			self.assertEqual(got.fact_hours, 45.0)
			self.assertEqual(got.consumers, BRANCH)

	def test_own_plan_leaf_keeps_own_pot(self):
		got = _screen("t1.1.1", used=USED)
		self.assertEqual(got.plan_hours, 20.0)
		self.assertEqual(got.fact_hours, 5.0)
		self.assertEqual(got.consumers, frozenset({"t1.1.1"}))

	def test_month_leaf_inherits_branch_consumers(self):
		got = _screen("t1.1.3", 2026, 1, used=USED)
		self.assertEqual(got.plan_hours, 10.0)
		self.assertEqual(got.consumers, BRANCH)


class TestAdapterScreenFlags(unittest.TestCase):
	def test_leaf_used_parent_all_periods(self):
		got = _screen("t1.1.3")
		self.assertTrue(got.used_parent)
		self.assertEqual(got.plan_hours, 45.0)
		self.assertIn("t1.1", {row["task_name"] for row in got.plan_sources})
		self.assertEqual(got.plan_task_subject, "Подзадача 1.1")

	def test_node_with_own_cell_not_used_parent(self):
		got = _screen("t1.1")
		self.assertFalse(got.used_parent)
		self.assertEqual(
			{row["task_name"] for row in got.plan_sources},
			{"t1.1.1", "t1.1.2"},
		)
		self.assertEqual(got.plan_task_subject, "Подзадача 1.1")

	def test_month2_sources_are_children(self):
		got = _screen("t1.1", 2026, 2)
		self.assertEqual(got.plan_hours, 35.0)
		self.assertFalse(got.used_parent)
		self.assertEqual(
			{(row["task_name"], row["planned_hours"]) for row in got.plan_sources},
			{("t1.1.1", 15.0), ("t1.1.2", 20.0)},
		)

	def test_own_month_sources_empty(self):
		got = _screen("t1.1", 2026, 1)
		self.assertFalse(got.used_parent)
		self.assertEqual(got.plan_sources, ())

	def test_inherited_month_source_is_parent(self):
		got = _screen("t1.1.3", 2026, 1)
		self.assertEqual(got.plan_hours, 10.0)
		self.assertTrue(got.used_parent)
		self.assertEqual(got.assembled_at, "t1.1")
		self.assertEqual(got.plan_sources[0]["task_name"], "t1.1")
		self.assertEqual(got.plan_sources[0]["planned_hours"], 10.0)
		self.assertEqual(got.plan_task_subject, "Подзадача 1.1")


class TestAdapterIvanExpected(unittest.TestCase):
	def test_same_rules_other_numbers(self):
		bulk = _bulk()
		hours = TimesheetPlanFactAdapter.hours_by_role
		self.assertEqual(hours(bulk, PROJECT, "t1.1", hours_key="expected"), {ROLE: 38.0})
		self.assertEqual(hours(bulk, PROJECT, "t1", hours_key="expected"), {ROLE: 38.0})
		self.assertEqual(hours(bulk, PROJECT, "t1.1.3", hours_key="expected"), {ROLE: 38.0})
		self.assertEqual(hours(bulk, PROJECT, "t1.1.1", hours_key="expected"), {ROLE: 16.0})

	def test_month_own_cell_not_children(self):
		got = TimesheetPlanFactAdapter.result(
			_bulk(), PROJECT, "t1.1", ROLE, 2026, 1, hours_key="expected"
		)
		self.assertEqual(got.plan_hours, 8.0)

	def test_empty_month_sums_children(self):
		got = TimesheetPlanFactAdapter.result(
			_bulk(), PROJECT, "t1.1", ROLE, 2026, 2, hours_key="expected"
		)
		self.assertEqual(got.plan_hours, 30.0)


class TestCalculatorForecastHours(unittest.TestCase):
	def test_own_month_expected(self):
		hours = TimesheetLimitsCalculator._forecast_hours(
			_bulk(), PROJECT, "t1.1", ROLE, 2026, 1
		)
		self.assertEqual(hours, 8.0)

	def test_empty_month_is_zero(self):
		hours = TimesheetLimitsCalculator._forecast_hours(
			_bulk(), PROJECT, "t1.1", ROLE, 2026, 3
		)
		self.assertEqual(hours, 0.0)


class TestAdapterShared(unittest.TestCase):
	def test_hours_by_role_and_consumers(self):
		bulk = _bulk()
		hours = TimesheetPlanFactAdapter.hours_by_role(bulk, PROJECT, "t1.1.3")
		self.assertEqual(hours, {ROLE: 45.0})
		self.assertEqual(
			TimesheetPlanFactAdapter.consumers_for(bulk, PROJECT, "t1.1.3"),
			BRANCH,
		)
		self.assertEqual(
			TimesheetPlanFactAdapter.assembled_node(bulk, PROJECT, "t1.1.3", ROLE),
			"t1.1",
		)
		self.assertEqual(
			TimesheetPlanFactAdapter.hours_by_role(bulk, PROJECT, "t1.1.1"),
			{ROLE: 20.0},
		)


class TestAdapterRequestCache(unittest.TestCase):
	"""Один bulk — один проход по срезам. Второй вызов и другая задача не смешиваются."""

	def test_repeat_for_screen_same_plan_and_snapshots(self):
		bulk = _bulk()
		first = TimesheetPlanFactAdapter.for_screen(bulk, PROJECT, "t1.1.3", ROLE, None, None)
		second = TimesheetPlanFactAdapter.for_screen(bulk, PROJECT, "t1.1.3", ROLE, None, None)
		self.assertEqual(first, second)
		self.assertEqual(first.plan_hours, 45.0)
		self.assertEqual(first.consumers, BRANCH)
		parent_a, snaps_a = TimesheetPlanFactAdapter.slices(bulk, PROJECT)
		parent_b, snaps_b = TimesheetPlanFactAdapter.slices(bulk, PROJECT)
		self.assertIs(parent_a, parent_b)
		self.assertIs(snaps_a, snaps_b)

	def test_two_tasks_on_one_bulk_keep_own_pots(self):
		bulk = _bulk()
		leaf = TimesheetPlanFactAdapter.for_screen(bulk, PROJECT, "t1.1.1", ROLE, None, None)
		branch = TimesheetPlanFactAdapter.for_screen(bulk, PROJECT, "t1.1.3", ROLE, None, None)
		forecast = TimesheetPlanFactAdapter.result(
			bulk, PROJECT, "t1.1.3", ROLE, hours_key="expected"
		)
		self.assertEqual(leaf.plan_hours, 20.0)
		self.assertEqual(leaf.consumers, frozenset({"t1.1.1"}))
		self.assertEqual(branch.plan_hours, 45.0)
		self.assertEqual(branch.consumers, BRANCH)
		self.assertEqual(forecast.plan_hours, 38.0)
		self.assertIsNot(
			TimesheetPlanFactAdapter.slices(bulk, PROJECT, "plan")[1],
			TimesheetPlanFactAdapter.slices(bulk, PROJECT, "expected")[1],
		)

	def test_second_bulk_does_not_reuse_first_cache(self):
		first = _bulk()
		second = _bulk()
		second.pwe_amounts = {
			"pwe-11": [{"year": 2026, "month": 1, "plan": 7.0, "expected": 1.0}],
		}
		TimesheetPlanFactAdapter.for_screen(first, PROJECT, "t1.1", ROLE, 2026, 1)
		got = TimesheetPlanFactAdapter.for_screen(second, PROJECT, "t1.1", ROLE, 2026, 1)
		self.assertEqual(got.plan_hours, 7.0)
		self.assertIsNot(
			TimesheetPlanFactAdapter.slices(first, PROJECT)[1],
			TimesheetPlanFactAdapter.slices(second, PROJECT)[1],
		)
