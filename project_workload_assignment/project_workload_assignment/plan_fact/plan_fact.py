# Copyright (c) 2026, Dinext
"""
План и факт ветки. Один снимок — один срез.

План:
  1) своя клетка > 0 → её, детей не суммируем;
  2) своей нет → сумма того же правила по детям;
  3) нет ни своего, ни детей с планом → то же у родителя.

Факт: сумма списаний у едоков.
Едоки = поддерево узла, где собрался план, плюс предки
без своей клетки с тем же числом. Списание на корне ветки
видит пустой лист. Предок со своей клеткой — чужой котёл.

Несколько срезов: compute каждый, потом fold.
Цвет, календарь, DocType — не здесь.
"""

from __future__ import annotations

from typing import Iterable

from project_workload_assignment.project_workload_assignment.plan_fact.models import (
	Entry,
	Result,
	Snapshot,
)


class PlanFact:
	@classmethod
	def compute(cls, snapshot: Snapshot, node: str, role: str) -> Result | None:
		"""План, факт и едоки для одного среза. Нет плана → None."""
		walked = cls._plan(snapshot, node, role, visited=set())
		if walked is None:
			return None
		hours, assembled_at = walked
		consumers = cls._consumers(snapshot, assembled_at, role, hours)
		return Result(
			node=node,
			role=role,
			plan_hours=hours,
			fact_hours=cls._sum_used(snapshot.used, consumers, role),
			consumers=consumers,
			assembled_at=assembled_at,
		)

	@classmethod
	def fold(
		cls,
		results: Iterable[Result | None],
		used: Iterable[Entry] = (),
	) -> Result | None:
		"""
		Сложить срезы: сумма планов, едоки — объединение.

		used задан — факт считаем один раз по объединению едоков.
		Иначе складываем fact_hours срезов (у каждого свои списания).
		"""
		parts = [row for row in results if row is not None]
		if not parts:
			return None
		consumers: set[str] = set()
		plan_hours = 0.0
		fact_hours = 0.0
		for row in parts:
			plan_hours += row.plan_hours
			fact_hours += row.fact_hours
			consumers.update(row.consumers)
		used_rows = tuple(used)
		if used_rows:
			fact_hours = cls._sum_used(used_rows, frozenset(consumers), parts[0].role)
		first = parts[0]
		inherited = [row.assembled_at for row in parts if row.assembled_at != row.node]
		return Result(
			node=first.node,
			role=first.role,
			plan_hours=plan_hours,
			fact_hours=fact_hours,
			consumers=frozenset(consumers),
			assembled_at=inherited[0] if inherited and len(inherited) == len(parts) else first.node,
		)

	@classmethod
	def _plan(
		cls,
		snapshot: Snapshot,
		node: str,
		role: str,
		visited: set[str],
	) -> tuple[float, str] | None:
		"""Своя ветка из памяти. Пустая ветка — подъём к родителю, как раньше."""
		if node in visited:
			return None
		local = cls._local(snapshot, node, role)
		if local is not None:
			return local
		parent = snapshot.parent(node)
		if not parent:
			return None
		return cls._plan(snapshot, parent, role, visited | {node})

	@classmethod
	def _local(
		cls,
		snapshot: Snapshot,
		node: str,
		role: str,
		stack: set[str] | None = None,
	) -> tuple[float, str] | None:
		"""Своя клетка или сумма детей. Без подъёма. Один раз на снимок и роль."""
		memo = cls._local_memo(snapshot)
		key = (node, role)
		if key in memo:
			return memo[key]
		if stack is None:
			stack = set()
		if node in stack:
			return None
		stack.add(node)
		own = snapshot.own_plan(node, role)
		if own > 0:
			got: tuple[float, str] | None = (own, node)
		else:
			child_total = 0.0
			found_child = False
			for child in snapshot.children(node):
				child_plan = cls._local(snapshot, child, role, stack)
				if child_plan is None:
					continue
				found_child = True
				child_total += child_plan[0]
			got = (child_total, node) if found_child else None
		stack.remove(node)
		memo[key] = got
		return got

	@staticmethod
	def _local_memo(snapshot: Snapshot) -> dict:
		memo = getattr(snapshot, "_local_plan", None)
		if memo is None:
			memo = {}
			object.__setattr__(snapshot, "_local_plan", memo)
		return memo

	@classmethod
	def _consumers(
		cls,
		snapshot: Snapshot,
		assembled_at: str,
		role: str,
		hours: float,
	) -> frozenset[str]:
		"""От узла сборки вверх, пока у предка нет своей клетки и план тот же."""
		root = assembled_at
		guard: set[str] = set()
		current = snapshot.parent(assembled_at)
		while current and current not in guard:
			guard.add(current)
			if snapshot.own_plan(current, role) > 0:
				break
			parent_plan = cls._plan(snapshot, current, role, visited=set())
			if parent_plan is None or parent_plan[0] != hours:
				break
			root = current
			current = snapshot.parent(current)
		return snapshot.subtree(root)

	@staticmethod
	def _sum_used(used: tuple[Entry, ...], consumers: frozenset[str], role: str) -> float:
		total = 0.0
		for row in used:
			if row.role == role and row.node in consumers:
				total += float(row.hours)
		return total
