# Copyright (c) 2026, Dinext
"""ISS-2026-02105: hierarchical plan (own month > children > parent)."""

from __future__ import annotations

from frappe.tests.utils import FrappeTestCase

from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.bulk_loader import (
	TimesheetLimitsBulkData,
)
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.calculator import (
	TimesheetLimitsCalculator,
	_CalculatorState,
)
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.plan_resolver import (
	TaskPlanResolver,
)
from project_workload_assignment.project_workload_assignment.work_efforts.work_efforts_progress import (
	sum_hierarchical_plan_hours,
)

PROJECT = "ISS-02105"
ROLE = "Dev"
ANALYST = "Analyst"


def _case_maps():
	"""Ticket tree: 1.1 month1=10 own; month2=children 15+20; 1.1.3 inherits 45."""
	task_meta = {
		"t1": {"subject": "Задача 1", "parent_task": None, "custom_linked_issue": False},
		"t1.1": {
			"subject": "Подзадача 1.1",
			"parent_task": "t1",
			"custom_linked_issue": False,
		},
		"t1.1.1": {
			"subject": "Подзадача 1.1.1",
			"parent_task": "t1.1",
			"custom_linked_issue": False,
		},
		"t1.1.2": {
			"subject": "Подзадача 1.1.2",
			"parent_task": "t1.1",
			"custom_linked_issue": False,
		},
		"t1.1.3": {
			"subject": "Подзадача 1.1.3",
			"parent_task": "t1.1",
			"custom_linked_issue": False,
		},
	}
	children_map = {
		(PROJECT, "t1"): ["t1.1"],
		(PROJECT, "t1.1"): ["t1.1.1", "t1.1.2", "t1.1.3"],
		(PROJECT, "t1.1.1"): [],
		(PROJECT, "t1.1.2"): [],
		(PROJECT, "t1.1.3"): [],
	}
	pwe_by_task_role = {
		(PROJECT, "t1.1", ROLE): ["pwe-11"],
		(PROJECT, "t1.1.1", ROLE): ["pwe-111"],
		(PROJECT, "t1.1.2", ROLE): ["pwe-112"],
	}
	pwe_amounts = {
		"pwe-11": [{"year": 2026, "month": 1, "plan": 10.0}],
		"pwe-111": [
			{"year": 2026, "month": 1, "plan": 5.0},
			{"year": 2026, "month": 2, "plan": 15.0},
		],
		"pwe-112": [
			{"year": 2026, "month": 1, "plan": 5.0},
			{"year": 2026, "month": 2, "plan": 20.0},
		],
	}
	return task_meta, children_map, pwe_by_task_role, pwe_amounts


def _mut_maps():
	return list(_case_maps())


def _bulk(maps=None) -> TimesheetLimitsBulkData:
	task_meta, children_map, pwe_by_task_role, pwe_amounts = maps or _case_maps()
	return TimesheetLimitsBulkData(
		task_meta=task_meta,
		children_map=children_map,
		pwe_by_task_role=pwe_by_task_role,
		pwe_amounts=pwe_amounts,
	)


def _plan(task, year=None, month=None, *, role=ROLE, bulk=None, **kwargs):
	data = bulk or _bulk()
	return TaskPlanResolver.resolve(
		PROJECT, task, role, year, month, data, **kwargs
	)


def _hours(plan):
	return None if plan is None else plan["planned_hours"]


class TestTimesheetLimitsPlan(FrappeTestCase):
	def test_own_month_ignores_children(self):
		self.assertEqual(_hours(_plan("t1.1", 2026, 1)), 10.0)

	def test_empty_month_sums_children(self):
		self.assertEqual(_hours(_plan("t1.1", 2026, 2)), 35.0)

	def test_root_empty_month_sums_child_tree(self):
		self.assertEqual(_hours(_plan("t1", 2026, 1)), 10.0)
		self.assertEqual(_hours(_plan("t1", 2026, 2)), 35.0)

	def test_task_11_all_periods_is_45(self):
		self.assertEqual(_hours(_plan("t1.1")), 45.0)

	def test_root_all_periods_is_45(self):
		self.assertEqual(_hours(_plan("t1")), 45.0)

	def test_leaf_without_plan_inherits_45(self):
		got = _plan("t1.1.3")
		self.assertEqual(_hours(got), 45.0)
		self.assertEqual(got["task_name"], "t1.1.3")

	def test_leaf_own_plan_is_not_parent_sum(self):
		self.assertEqual(_hours(_plan("t1.1.1")), 20.0)

	def test_leaf_own_month_is_not_parent_own(self):
		self.assertEqual(_hours(_plan("t1.1.1", 2026, 1)), 5.0)
		self.assertEqual(_hours(_plan("t1.1.1", 2026, 2)), 15.0)

	def test_month_without_any_plan_is_none(self):
		self.assertIsNone(_plan("t1.1", 2026, 3))
		self.assertIsNone(_plan("t1.1.3", 2026, 3))

	def test_other_role_is_isolated(self):
		self.assertIsNone(_plan("t1.1", 2026, 1, role=ANALYST))
		self.assertEqual(_hours(_plan("t1.1", 2026, 1, role=ROLE)), 10.0)

	def test_zero_own_plan_falls_through_to_children(self):
		maps = _mut_maps()
		maps[3]["pwe-11"] = [{"year": 2026, "month": 2, "plan": 0.0}]
		bulk = _bulk(maps)
		self.assertEqual(_hours(_plan("t1.1", 2026, 2, bulk=bulk)), 35.0)

	def test_two_pwe_rows_same_task_role_month_sum(self):
		maps = _mut_maps()
		maps[2][(PROJECT, "t1.1", ROLE)] = ["pwe-11a", "pwe-11b"]
		maps[3].pop("pwe-11")
		maps[3]["pwe-11a"] = [{"year": 2026, "month": 1, "plan": 4.0}]
		maps[3]["pwe-11b"] = [{"year": 2026, "month": 1, "plan": 6.0}]
		self.assertEqual(_hours(_plan("t1.1", 2026, 1, bulk=_bulk(maps))), 10.0)

	def test_month2_plan_sources_are_children(self):
		got = _plan("t1.1", 2026, 2)
		names = {row["task_name"] for row in got["plan_sources"]}
		self.assertEqual(names, {"t1.1.1", "t1.1.2"})
		self.assertEqual(got["task_name"], "t1.1")

	def test_issue_gate_blocks_walk_above_request_root(self):
		maps = _mut_maps()
		maps[3] = {
			"pwe-root": [{"year": 2026, "month": 3, "plan": 100.0}],
		}
		maps[2] = {(PROJECT, "t1", ROLE): ["pwe-root"]}
		bulk = _bulk(maps)
		open_plan = _plan("t1.1.3", 2026, 3, bulk=bulk)
		self.assertEqual(_hours(open_plan), 100.0)
		gated = _plan(
			"t1.1.3",
			2026,
			3,
			bulk=bulk,
			requirement="Обязательно для всех Запросов",
			root_task_with_issue="t1.1",
			can_go_above_root_issue=False,
		)
		self.assertIsNone(gated)

	def test_issue_gate_allows_walk_when_flag_set(self):
		maps = _mut_maps()
		maps[3] = {"pwe-root": [{"year": 2026, "month": 3, "plan": 100.0}]}
		maps[2] = {(PROJECT, "t1", ROLE): ["pwe-root"]}
		got = _plan(
			"t1.1.3",
			2026,
			3,
			bulk=_bulk(maps),
			requirement="Обязательно для всех Запросов",
			root_task_with_issue="t1.1",
			can_go_above_root_issue=True,
		)
		self.assertEqual(_hours(got), 100.0)

	def test_parent_cycle_does_not_loop(self):
		task_meta = {
			"a": {"subject": "A", "parent_task": "b", "custom_linked_issue": False},
			"b": {"subject": "B", "parent_task": "a", "custom_linked_issue": False},
		}
		bulk = TimesheetLimitsBulkData(
			task_meta=task_meta,
			children_map={(PROJECT, "a"): [], (PROJECT, "b"): []},
			pwe_by_task_role={},
			pwe_amounts={},
		)
		self.assertIsNone(_plan("a", 2026, 1, bulk=bulk))


class TestTimesheetLimitsFactScope(FrappeTestCase):
	def _scope(self, task, year=None, month=None):
		bulk = _bulk()
		state = _CalculatorState(bulk)
		plan = TaskPlanResolver.resolve(PROJECT, task, ROLE, year, month, bulk)
		return TimesheetLimitsCalculator._fact_scope(task, plan, PROJECT, bulk, state)

	def test_all_period_leaf_fact_is_leaf_only(self):
		fact, plan_task, used_parent = self._scope("t1.1.3")
		self.assertEqual(plan_task, "t1.1.3")
		self.assertFalse(used_parent)
		self.assertEqual(fact, ["t1.1.3"])

	def test_month_leaf_inherits_parent_fact_subtree(self):
		fact, plan_task, used_parent = self._scope("t1.1.3", 2026, 1)
		self.assertTrue(used_parent)
		self.assertEqual(plan_task, "t1.1")
		self.assertEqual(set(fact), {"t1.1", "t1.1.1", "t1.1.2", "t1.1.3"})

	def test_parent_position_fact_includes_children(self):
		fact, plan_task, used_parent = self._scope("t1.1")
		self.assertFalse(used_parent)
		self.assertEqual(plan_task, "t1.1")
		self.assertEqual(set(fact), {"t1.1", "t1.1.1", "t1.1.2", "t1.1.3"})

	def test_no_plan_parent_still_adds_children_for_fact(self):
		maps = _mut_maps()
		maps[2] = {}
		maps[3] = {}
		bulk = _bulk(maps)
		state = _CalculatorState(bulk)
		fact, plan_task, used_parent = TimesheetLimitsCalculator._fact_scope(
			"t1.1", None, PROJECT, bulk, state
		)
		self.assertFalse(used_parent)
		self.assertEqual(plan_task, "t1.1")
		self.assertEqual(set(fact), {"t1.1", "t1.1.1", "t1.1.2", "t1.1.3"})


class TestWorkEffortsProgressPlan(FrappeTestCase):
	def test_ticket_tree_is_45_not_flat_55(self):
		periods = [{"year": 2026, "month": 1}, {"year": 2026, "month": 2}]
		got = sum_hierarchical_plan_hours(PROJECT, [ROLE], periods, _bulk())
		self.assertEqual(got, 45.0)
		flat = sum(a["plan"] for rows in _case_maps()[3].values() for a in rows)
		self.assertEqual(flat, 55.0)

	def test_single_month_subset(self):
		self.assertEqual(
			sum_hierarchical_plan_hours(
				PROJECT, [ROLE], [{"year": 2026, "month": 1}], _bulk()
			),
			10.0,
		)
		self.assertEqual(
			sum_hierarchical_plan_hours(
				PROJECT, [ROLE], [{"year": 2026, "month": 2}], _bulk()
			),
			35.0,
		)

	def test_empty_roles_or_periods(self):
		self.assertEqual(sum_hierarchical_plan_hours(PROJECT, [], [{"year": 2026, "month": 1}], _bulk()), 0.0)
		self.assertEqual(sum_hierarchical_plan_hours(PROJECT, [ROLE], [], _bulk()), 0.0)

	def test_two_roots_are_summed(self):
		task_meta, children_map, pwe_by_task_role, pwe_amounts = _case_maps()
		task_meta["t2"] = {
			"subject": "Задача 2",
			"parent_task": None,
			"custom_linked_issue": False,
		}
		children_map[(PROJECT, "t2")] = []
		pwe_by_task_role[(PROJECT, "t2", ROLE)] = ["pwe-2"]
		pwe_amounts["pwe-2"] = [{"year": 2026, "month": 1, "plan": 20.0}]
		bulk = TimesheetLimitsBulkData(
			task_meta=task_meta,
			children_map=children_map,
			pwe_by_task_role=pwe_by_task_role,
			pwe_amounts=pwe_amounts,
		)
		periods = [{"year": 2026, "month": 1}, {"year": 2026, "month": 2}]
		self.assertEqual(sum_hierarchical_plan_hours(PROJECT, [ROLE], periods, bulk), 65.0)

	def test_roles_sum_without_mixing_hours(self):
		task_meta, children_map, pwe_by_task_role, pwe_amounts = _case_maps()
		pwe_by_task_role[(PROJECT, "t1.1", ANALYST)] = ["pwe-11-a"]
		pwe_amounts["pwe-11-a"] = [{"year": 2026, "month": 1, "plan": 100.0}]
		bulk = TimesheetLimitsBulkData(
			task_meta=task_meta,
			children_map=children_map,
			pwe_by_task_role=pwe_by_task_role,
			pwe_amounts=pwe_amounts,
		)
		periods = [{"year": 2026, "month": 1}, {"year": 2026, "month": 2}]
		self.assertEqual(sum_hierarchical_plan_hours(PROJECT, [ROLE], periods, bulk), 45.0)
		self.assertEqual(sum_hierarchical_plan_hours(PROJECT, [ANALYST], periods, bulk), 100.0)
		self.assertEqual(
			sum_hierarchical_plan_hours(PROJECT, [ROLE, ANALYST], periods, bulk), 145.0
		)

	def test_orphan_parent_not_in_meta_is_root(self):
		bulk = TimesheetLimitsBulkData(
			task_meta={
				"leaf": {
					"subject": "Leaf",
					"parent_task": "missing",
					"custom_linked_issue": False,
				}
			},
			children_map={(PROJECT, "leaf"): []},
			pwe_by_task_role={(PROJECT, "leaf", ROLE): ["pwe-leaf"]},
			pwe_amounts={"pwe-leaf": [{"year": 2026, "month": 1, "plan": 8.0}]},
		)
		got = sum_hierarchical_plan_hours(
			PROJECT, [ROLE], [{"year": 2026, "month": 1}], bulk
		)
		self.assertEqual(got, 8.0)
