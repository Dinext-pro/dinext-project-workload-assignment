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

	def test_shared_tree_matches_separate_snapshots(self):
		"""Общее дерево, свои часы месяца. Сверка с отдельным Snapshot.build."""
		from project_workload_assignment.project_workload_assignment.plan_fact import (
			PlanFact,
			Snapshot,
		)

		bulk = _bulk()
		parent_of, snaps = TimesheetPlanFactAdapter.slices(bulk, PROJECT)
		jan = snaps[(2026, 1)]
		feb = snaps[(2026, 2)]
		self.assertIs(jan.children_of, feb.children_of)
		self.assertIs(jan.parent_of, feb.parent_of)
		self.assertIsNot(jan, feb)
		self.assertIsNot(jan.plan, feb.plan)
		self.assertEqual(jan.plan[("t1.1", ROLE)], 10.0)
		self.assertNotIn(("t1.1", ROLE), feb.plan)

		built = {
			(2026, 1): Snapshot.build(
				parent_of=parent_of,
				plan=[
					Entry("t1.1", ROLE, 10),
					Entry("t1.1.1", ROLE, 5),
					Entry("t1.1.2", ROLE, 5),
				],
			),
			(2026, 2): Snapshot.build(
				parent_of=parent_of,
				plan=[Entry("t1.1.1", ROLE, 15), Entry("t1.1.2", ROLE, 20)],
			),
		}
		for month, fresh in built.items():
			for node in ("t1", "t1.1", "t1.1.1", "t1.1.2", "t1.1.3"):
				got = PlanFact.compute(snaps[month], node, ROLE)
				ref = PlanFact.compute(fresh, node, ROLE)
				if ref is None:
					self.assertIsNone(got, f"{month} {node}")
					continue
				self.assertEqual(got.plan_hours, ref.plan_hours, f"{month} {node}")
				self.assertEqual(got.assembled_at, ref.assembled_at, f"{month} {node}")
				self.assertEqual(got.consumers, ref.consumers, f"{month} {node}")

		self.assertEqual(
			TimesheetPlanFactAdapter.for_screen(bulk, PROJECT, "t1.1", ROLE, 2026, 1).plan_hours,
			10.0,
		)
		self.assertEqual(
			TimesheetPlanFactAdapter.for_screen(bulk, PROJECT, "t1.1", ROLE, 2026, 2).plan_hours,
			35.0,
		)
		self.assertEqual(
			TimesheetPlanFactAdapter.result(
				bulk, PROJECT, "t1.1", ROLE, 2026, 1, hours_key="expected"
			).plan_hours,
			8.0,
		)
		self.assertEqual(
			TimesheetPlanFactAdapter.result(
				bulk, PROJECT, "t1.1", ROLE, 2026, 2, hours_key="expected"
			).plan_hours,
			30.0,
		)


class TestFactFollowsMonthPot(unittest.TestCase):
	"""Январь на родителе, февраль на ребёнке. Факт февраля соседа в строку A не входит."""

	def _bulk(self):
		from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.fact_period import (
			add_fact,
		)

		bulk = TimesheetLimitsBulkData(
			task_meta={
				"p": {"subject": "Родитель", "parent_task": None},
				"a": {"subject": "Ребёнок A", "parent_task": "p"},
				"b": {"subject": "Ребёнок B", "parent_task": "p"},
			},
			children_map={
				(PROJECT, "p"): ["a", "b"],
				(PROJECT, "a"): [],
				(PROJECT, "b"): [],
			},
			pwe_by_task_role={
				(PROJECT, "p", ROLE): ["pwe-p"],
				(PROJECT, "a", ROLE): ["pwe-a"],
			},
			pwe_amounts={
				"pwe-p": [
					{"year": 2026, "month": 1, "plan": 10.0},
					{"year": 2026, "month": 2, "plan": 7.0},
				],
				"pwe-a": [{"year": 2026, "month": 2, "plan": 5.0}],
			},
		)
		add_fact(bulk, 2026, 1, "p", ROLE, 8, "Согласовано", "Иван")
		add_fact(bulk, 2026, 1, "b", ROLE, 3, "Согласовано", "Иван")
		add_fact(bulk, 2026, 1, "a", ROLE, 1, "Редактирование", "Иван")
		add_fact(bulk, 2026, 2, "a", ROLE, 4, "Согласовано", "Иван")
		add_fact(bulk, 2026, 2, "b", ROLE, 100, "Согласовано", "Пётр")
		add_fact(bulk, 2026, 2, "p", ROLE, 50, "Согласовано", "Иван")
		return bulk

	def test_child_fact_is_sum_of_month_pots(self):
		bulk = self._bulk()
		screen = TimesheetPlanFactAdapter.for_screen(bulk, PROJECT, "a", ROLE, None, None)
		data = TimesheetPlanFactAdapter.hours_data(bulk, PROJECT, "a", ROLE, None, None)
		self.assertEqual(screen.plan_hours, 15.0)
		self.assertEqual(screen.fact_hours, 16.0)
		self.assertEqual(data["total"], 16.0)
		self.assertEqual(data["Согласовано"], 15.0)
		self.assertEqual(data["Редактирование"], 1.0)
		self.assertEqual(data["users"], {"Иван"})

	def test_february_sibling_stays_in_february(self):
		bulk = self._bulk()
		feb = TimesheetPlanFactAdapter.for_screen(bulk, PROJECT, "a", ROLE, 2026, 2)
		jan = TimesheetPlanFactAdapter.for_screen(bulk, PROJECT, "a", ROLE, 2026, 1)
		self.assertEqual(feb.plan_hours, 5.0)
		self.assertEqual(feb.fact_hours, 4.0)
		self.assertEqual(jan.fact_hours, 12.0)
		_parent, snaps = TimesheetPlanFactAdapter.slices(bulk, PROJECT)
		self.assertIsNot(snaps[(2026, 1)].used, snaps[(2026, 2)].used)

	def test_open_timesheet_details_split_by_date(self):
		from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.fact_period import (
			absorb_positions,
		)

		bulk = self._bulk()
		absorb_positions(
			bulk,
			[
				{
					"document_name": "a",
					"project_role": ROLE,
					"status": "Редактирование",
					"custom_username": "Иван",
					"details": [
						{"date": "2026-01-31", "hours": 2},
						{"date": "2026-02-01", "hours": 6},
					],
				},
				{
					"document_name": "a",
					"project_role": ROLE,
					"year": 2026,
					"month": 2,
					"all_hours": 99,
					"details": [{"date": "2026-02-01", "hours": 7}],
				},
			],
		)
		data = TimesheetPlanFactAdapter.hours_data(bulk, PROJECT, "a", ROLE, None, None)
		self.assertEqual(data["total"], 16.0 + 2.0 + 6.0)


REQUESTS = "Обязательно для всех Запросов"
OPTIONAL = "Опционально"


def _ceiling_bulk(mode: str) -> TimesheetLimitsBulkData:
	return TimesheetLimitsBulkData(
		task_meta={
			"p": {"subject": "ЗНО", "parent_task": None, "project": PROJECT},
			"v": {
				"subject": "Запрос",
				"parent_task": "p",
				"project": PROJECT,
				"custom_linked_issue": True,
			},
			"a": {"subject": "Часы", "parent_task": "v", "project": PROJECT},
		},
		children_map={
			(PROJECT, "p"): ["v"],
			(PROJECT, "v"): ["a"],
			(PROJECT, "a"): [],
		},
		pwe_by_task_role={
			(PROJECT, "p", ROLE): ["pwe-p"],
			(PROJECT, "a", ROLE): ["pwe-a"],
		},
		pwe_amounts={
			"pwe-p": [{"year": 2026, "month": 1, "plan": 40.0, "expected": 50.0}],
			"pwe-a": [{"year": 2026, "month": 2, "plan": 15.0, "expected": 12.0}],
		},
		plan_requirement_by_project={PROJECT: mode},
	)


class TestIssueCeilingOnAdapter(unittest.TestCase):
	def test_optional_still_climbs_to_parent(self):
		bulk = _ceiling_bulk(OPTIONAL)
		screen = TimesheetPlanFactAdapter.for_screen(bulk, PROJECT, "v", ROLE, None, None)
		self.assertEqual(screen.plan_hours, 55.0)
		self.assertIn("p", screen.consumers)
		forecast = TimesheetPlanFactAdapter.result(
			bulk, PROJECT, "v", ROLE, hours_key="expected"
		)
		self.assertEqual(forecast.plan_hours, 62.0)

	def test_requests_mode_stops_above_virtual_task(self):
		bulk = _ceiling_bulk(REQUESTS)
		screen = TimesheetPlanFactAdapter.for_screen(bulk, PROJECT, "v", ROLE, None, None)
		self.assertEqual(screen.plan_hours, 15.0)
		self.assertNotIn("p", screen.consumers)
		self.assertIn("a", screen.consumers)
		forecast = TimesheetPlanFactAdapter.result(
			bulk, PROJECT, "v", ROLE, hours_key="expected"
		)
		self.assertEqual(forecast.plan_hours, 12.0)
		self.assertNotIn("p", forecast.consumers)

	def test_leaf_under_issue_does_not_take_parent_month(self):
		bulk = _ceiling_bulk(REQUESTS)
		screen = TimesheetPlanFactAdapter.for_screen(bulk, PROJECT, "a", ROLE, None, None)
		self.assertEqual(screen.plan_hours, 15.0)
		self.assertNotIn("p", screen.consumers)

	def test_ivan_pot_stays_when_branch_is_the_issue(self):
		bulk = _bulk()
		bulk.task_meta["t1.1"]["custom_linked_issue"] = True
		bulk.task_meta["t1.1"]["project"] = PROJECT
		bulk.plan_requirement_by_project[PROJECT] = REQUESTS
		screen = TimesheetPlanFactAdapter.for_screen(bulk, PROJECT, "t1.1", ROLE, None, None)
		self.assertEqual(screen.plan_hours, 45.0)
		leaf = TimesheetPlanFactAdapter.for_screen(bulk, PROJECT, "t1.1.3", ROLE, None, None)
		self.assertEqual(leaf.plan_hours, 45.0)
