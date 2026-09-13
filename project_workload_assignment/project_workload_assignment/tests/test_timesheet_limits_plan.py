# Copyright (c) 2026, Dinext
"""Полоска проекта: план по корням, без двойного счёта. Без Frappe DB."""

from __future__ import annotations

import unittest

from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.bulk_loader import (
	TimesheetLimitsBulkData,
)
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.plan_fact_adapter import (
	TimesheetPlanFactAdapter,
)

PROJECT = "ISS-02105"
ROLE = "Dev"
ANALYST = "Analyst"


def _case_maps():
	"""Дерево Ивана: корень 45, не плоские 55."""
	task_meta = {
		"t1": {"subject": "Задача 1", "parent_task": None},
		"t1.1": {"subject": "Подзадача 1.1", "parent_task": "t1"},
		"t1.1.1": {"subject": "Подзадача 1.1.1", "parent_task": "t1.1"},
		"t1.1.2": {"subject": "Подзадача 1.1.2", "parent_task": "t1.1"},
		"t1.1.3": {"subject": "Подзадача 1.1.3", "parent_task": "t1.1"},
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


def _bulk(maps=None) -> TimesheetLimitsBulkData:
	task_meta, children_map, pwe_by_task_role, pwe_amounts = maps or _case_maps()
	return TimesheetLimitsBulkData(
		task_meta=task_meta,
		children_map=children_map,
		pwe_by_task_role=pwe_by_task_role,
		pwe_amounts=pwe_amounts,
	)


class TestWorkEffortsProgressPlan(unittest.TestCase):
	def test_ticket_tree_is_45_not_flat_55(self):
		periods = [{"year": 2026, "month": 1}, {"year": 2026, "month": 2}]
		got = TimesheetPlanFactAdapter.sum_roots(_bulk(), PROJECT, [ROLE], periods)
		self.assertEqual(got, 45.0)
		flat = sum(a["plan"] for rows in _case_maps()[3].values() for a in rows)
		self.assertEqual(flat, 55.0)

	def test_single_month_subset(self):
		self.assertEqual(
			TimesheetPlanFactAdapter.sum_roots(
				_bulk(), PROJECT, [ROLE], [{"year": 2026, "month": 1}]
			),
			10.0,
		)
		self.assertEqual(
			TimesheetPlanFactAdapter.sum_roots(
				_bulk(), PROJECT, [ROLE], [{"year": 2026, "month": 2}]
			),
			35.0,
		)

	def test_empty_roles_or_periods(self):
		self.assertEqual(
			TimesheetPlanFactAdapter.sum_roots(
				_bulk(), PROJECT, [], [{"year": 2026, "month": 1}]
			),
			0.0,
		)
		self.assertEqual(
			TimesheetPlanFactAdapter.sum_roots(_bulk(), PROJECT, [ROLE], []), 0.0
		)

	def test_two_roots_are_summed(self):
		task_meta, children_map, pwe_by_task_role, pwe_amounts = _case_maps()
		task_meta["t2"] = {"subject": "Задача 2", "parent_task": None}
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
		self.assertEqual(
			TimesheetPlanFactAdapter.sum_roots(bulk, PROJECT, [ROLE], periods), 65.0
		)

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
		self.assertEqual(
			TimesheetPlanFactAdapter.sum_roots(bulk, PROJECT, [ROLE], periods), 45.0
		)
		self.assertEqual(
			TimesheetPlanFactAdapter.sum_roots(bulk, PROJECT, [ANALYST], periods), 100.0
		)
		self.assertEqual(
			TimesheetPlanFactAdapter.sum_roots(bulk, PROJECT, [ROLE, ANALYST], periods),
			145.0,
		)

	def test_orphan_parent_not_in_meta_is_root(self):
		bulk = TimesheetLimitsBulkData(
			task_meta={"leaf": {"subject": "Leaf", "parent_task": "missing"}},
			children_map={(PROJECT, "leaf"): []},
			pwe_by_task_role={(PROJECT, "leaf", ROLE): ["pwe-leaf"]},
			pwe_amounts={"pwe-leaf": [{"year": 2026, "month": 1, "plan": 8.0}]},
		)
		got = TimesheetPlanFactAdapter.sum_roots(
			bulk, PROJECT, [ROLE], [{"year": 2026, "month": 1}]
		)
		self.assertEqual(got, 8.0)
