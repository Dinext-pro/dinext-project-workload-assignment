# Copyright (c) 2026, Dinext
"""
Золотые тесты ядра плана/факта.

Дерево Ивана (два среза, не «все клетки скопом»):

  Задача              срез1 —     срез2 —
  └── Дочерняя        срез1 10    срез2 —
      ├── Доч. 1      срез1 5     срез2 15
      ├── Доч. 2      срез1 5     срез2 20
      └── Доч. 3      срез1 —     срез2 —

Котёл Задача / Дочерняя / Доч. 3 = 45 (10 + 15+20), не 55.
Списания: 5+15+5+10+10 = 45.
"""

from __future__ import annotations

import unittest

from project_workload_assignment.project_workload_assignment.plan_fact import (
	Entry,
	PlanFact,
	Snapshot,
)

ROLE = "Dev"

TREE = {
	"t1": None,
	"t1.1": "t1",
	"t1.1.1": "t1.1",
	"t1.1.2": "t1.1",
	"t1.1.3": "t1.1",
}

SLICE_1 = [
	Entry("t1.1", ROLE, 10),
	Entry("t1.1.1", ROLE, 5),
	Entry("t1.1.2", ROLE, 5),
]
SLICE_2 = [
	Entry("t1.1.1", ROLE, 15),
	Entry("t1.1.2", ROLE, 20),
]
USED = [
	Entry("t1", ROLE, 5),
	Entry("t1.1", ROLE, 15),
	Entry("t1.1.1", ROLE, 5),
	Entry("t1.1.2", ROLE, 10),
	Entry("t1.1.3", ROLE, 10),
]


def _slice(plan, used=()) -> Snapshot:
	return Snapshot.build(parent_of=TREE, plan=plan, used=used)


def _hours(snapshot: Snapshot, node: str) -> float | None:
	got = PlanFact.compute(snapshot, node, ROLE)
	return None if got is None else got.plan_hours


def _all(node: str, used=()):
	# списания без среза — в fold один раз, не в каждый снимок
	return PlanFact.fold(
		[
			PlanFact.compute(_slice(SLICE_1), node, ROLE),
			PlanFact.compute(_slice(SLICE_2), node, ROLE),
		],
		used=used,
	)


class TestIvanPlan(unittest.TestCase):
	def test_own_slice_ignores_children(self):
		self.assertEqual(_hours(_slice(SLICE_1), "t1.1"), 10.0)

	def test_empty_slice_sums_children(self):
		self.assertEqual(_hours(_slice(SLICE_2), "t1.1"), 35.0)

	def test_root_follows_child_tree(self):
		self.assertEqual(_hours(_slice(SLICE_1), "t1"), 10.0)
		self.assertEqual(_hours(_slice(SLICE_2), "t1"), 35.0)

	def test_folded_slices_are_45_not_flat_55(self):
		self.assertEqual(_all("t1").plan_hours, 45.0)
		self.assertEqual(_all("t1.1").plan_hours, 45.0)
		self.assertEqual(_all("t1.1.3").plan_hours, 45.0)
		self.assertEqual(_all("t1").assembled_at, "t1")
		self.assertEqual(_all("t1.1").assembled_at, "t1.1")
		self.assertEqual(_all("t1.1.3").assembled_at, "t1.1")
		self.assertEqual(sum(row.hours for row in SLICE_1 + SLICE_2), 55.0)

	def test_leaf_with_own_plan_is_20(self):
		self.assertEqual(_all("t1.1.1").plan_hours, 20.0)
		self.assertEqual(_hours(_slice(SLICE_1), "t1.1.1"), 5.0)
		self.assertEqual(_hours(_slice(SLICE_2), "t1.1.1"), 15.0)

	def test_empty_snapshot_is_none(self):
		self.assertIsNone(_hours(_slice([]), "t1.1"))

	def test_other_role_is_isolated(self):
		self.assertIsNone(PlanFact.compute(_slice(SLICE_1), "t1.1", "Analyst"))


class TestIvanConsumersAndFact(unittest.TestCase):
	def test_empty_leaf_eats_whole_branch(self):
		got = _all("t1.1.3", USED)
		self.assertEqual(got.plan_hours, 45.0)
		self.assertEqual(got.fact_hours, 45.0)
		self.assertEqual(got.consumers, frozenset({"t1", "t1.1", "t1.1.1", "t1.1.2", "t1.1.3"}))

	def test_parent_same_pot(self):
		got = _all("t1.1", USED)
		self.assertEqual(got.plan_hours, 45.0)
		self.assertEqual(got.fact_hours, 45.0)
		self.assertEqual(got.consumers, frozenset({"t1", "t1.1", "t1.1.1", "t1.1.2", "t1.1.3"}))

	def test_root_also_45(self):
		got = _all("t1", USED)
		self.assertEqual(got.plan_hours, 45.0)
		self.assertEqual(got.fact_hours, 45.0)

	def test_own_plan_leaf_keeps_own_pot(self):
		got = _all("t1.1.1", USED)
		self.assertEqual(got.plan_hours, 20.0)
		self.assertEqual(got.fact_hours, 5.0)
		self.assertEqual(got.consumers, frozenset({"t1.1.1"}))

	def test_empty_leaf_inherits_parent_slice(self):
		got = PlanFact.compute(_slice(SLICE_1, USED), "t1.1.3", ROLE)
		self.assertEqual(got.plan_hours, 10.0)
		self.assertEqual(got.assembled_at, "t1.1")
		self.assertEqual(got.consumers, frozenset({"t1", "t1.1", "t1.1.1", "t1.1.2", "t1.1.3"}))


class TestCoreEdges(unittest.TestCase):
	def test_zero_own_falls_to_children(self):
		snap = Snapshot.build(
			parent_of={"p": None, "c": "p"},
			plan=[Entry("c", ROLE, 8)],
		)
		self.assertEqual(_hours(snap, "p"), 8.0)

	def test_two_entries_same_node_sum(self):
		snap = Snapshot.build(
			parent_of={"a": None},
			plan=[Entry("a", ROLE, 4), Entry("a", ROLE, 6)],
		)
		self.assertEqual(_hours(snap, "a"), 10.0)

	def test_parent_cycle_does_not_loop(self):
		snap = Snapshot.build(parent_of={"a": "b", "b": "a"}, plan=[])
		self.assertIsNone(PlanFact.compute(snap, "a", ROLE))

	def test_own_parent_same_hours_is_other_pot(self):
		# корень и ребёнок оба по 10 — цифры совпали, котлы разные
		snap = Snapshot.build(
			parent_of={"root": None, "child": "root"},
			plan=[Entry("root", ROLE, 10), Entry("child", ROLE, 10)],
			used=[Entry("root", ROLE, 3), Entry("child", ROLE, 4)],
		)
		got = PlanFact.compute(snap, "child", ROLE)
		self.assertEqual(got.plan_hours, 10.0)
		self.assertEqual(got.consumers, frozenset({"child"}))
		self.assertEqual(got.fact_hours, 4.0)

	def test_fold_none_is_none(self):
		self.assertIsNone(PlanFact.fold([None, None]))

	def test_wide_tree_memo_matches_pots(self):
		"""20 веток × 30 листьев. Повторный compute того же снимка не меняет котёл."""
		import time

		parent_of = {"root": None}
		plan = []
		for branch in range(20):
			branch_name = f"b{branch}"
			parent_of[branch_name] = "root"
			for leaf in range(30):
				leaf_name = f"{branch_name}.{leaf}"
				parent_of[leaf_name] = branch_name
				if leaf % 2 == 0:
					plan.append(Entry(leaf_name, ROLE, 1))
		snap = Snapshot.build(parent_of=parent_of, plan=plan)
		started = time.perf_counter()
		root = PlanFact.compute(snap, "root", ROLE)
		again = PlanFact.compute(snap, "root", ROLE)
		empty = PlanFact.compute(snap, "b0.1", ROLE)
		own = PlanFact.compute(snap, "b0.0", ROLE)
		elapsed = time.perf_counter() - started
		self.assertEqual(root.plan_hours, 300.0)
		self.assertEqual(root.assembled_at, "root")
		self.assertEqual(again.plan_hours, 300.0)
		self.assertEqual(again.consumers, root.consumers)
		self.assertEqual(empty.plan_hours, 15.0)
		self.assertEqual(empty.assembled_at, "b0")
		self.assertEqual(own.plan_hours, 1.0)
		self.assertEqual(own.consumers, frozenset({"b0.0"}))
		self.assertLess(elapsed, 2.0)

	def test_memo_matches_fresh_walk(self):
		"""Память узла даёт те же часы и место сборки, что обход без памяти."""

		def walk(snapshot: Snapshot, node: str, role: str, visited: set[str]):
			if node in visited:
				return None
			step = visited | {node}
			own = snapshot.own_plan(node, role)
			if own > 0:
				return (own, node)
			total = 0.0
			found = False
			for child in snapshot.children(node):
				child_plan = walk(snapshot, child, role, step)
				if child_plan is None:
					continue
				found = True
				total += child_plan[0]
			if found:
				return (total, node)
			parent = snapshot.parent(node)
			if not parent:
				return None
			return walk(snapshot, parent, role, step)

		parent_of = {"root": None, "a": "root", "b": "root", "a1": "a", "a2": "a"}
		parent_of.update({f"c{i}": "b" for i in range(8)})
		plan = [
			Entry("a", ROLE, 10),
			Entry("a1", ROLE, 4),
			Entry("b", ROLE, 0),
			Entry("c0", ROLE, 3),
			Entry("c1", ROLE, 5),
			Entry("root", "Other", 9),
		]
		snap = Snapshot.build(parent_of=parent_of, plan=plan)
		for node in parent_of:
			for role in (ROLE, "Other"):
				fresh = walk(snap, node, role, set())
				got = PlanFact.compute(snap, node, role)
				if fresh is None:
					self.assertIsNone(got, node)
					continue
				self.assertEqual(got.plan_hours, fresh[0], node)
				self.assertEqual(got.assembled_at, fresh[1], node)


class TestIssuePlanCeiling(unittest.TestCase):
	"""«Обязательно для всех Запросов»: выше виртуальной задачи не поднимаемся."""

	def _snap(self):
		return Snapshot.build(
			parent_of={"p": None, "v": "p", "a": "v", "b": "v", "leaf": "v"},
			plan=[
				Entry("p", ROLE, 40),
				Entry("a", ROLE, 15),
				Entry("b", ROLE, 20),
			],
			used=[Entry("p", ROLE, 9), Entry("a", ROLE, 3), Entry("leaf", ROLE, 1)],
		)

	def test_no_plan_under_ceiling_does_not_take_parent(self):
		snap = Snapshot.build(
			parent_of={"p": None, "v": "p", "leaf": "v"},
			plan=[Entry("p", ROLE, 40)],
			used=[Entry("p", ROLE, 9), Entry("leaf", ROLE, 1)],
		)
		self.assertIsNone(PlanFact.compute(snap, "leaf", ROLE, frozenset({"v"})))
		open_got = PlanFact.compute(snap, "leaf", ROLE)
		self.assertEqual(open_got.plan_hours, 40.0)
		self.assertIn("p", open_got.consumers)

	def test_virtual_task_keeps_children_sum(self):
		got = PlanFact.compute(self._snap(), "v", ROLE, frozenset({"v"}))
		self.assertEqual(got.plan_hours, 35.0)
		self.assertNotIn("p", got.consumers)
		self.assertIn("a", got.consumers)
		self.assertEqual(got.fact_hours, 4.0)

	def test_own_hours_on_virtual_task_ignore_parent(self):
		snap = Snapshot.build(
			parent_of={"p": None, "v": "p"},
			plan=[Entry("p", ROLE, 100), Entry("v", ROLE, 16)],
		)
		got = PlanFact.compute(snap, "v", ROLE, frozenset({"v"}))
		self.assertEqual(got.plan_hours, 16.0)
		self.assertNotIn("p", got.consumers)
