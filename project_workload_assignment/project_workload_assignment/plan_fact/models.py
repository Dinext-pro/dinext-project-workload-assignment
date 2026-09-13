# Copyright (c) 2026, Dinext
"""
Снимок одного среза и результат расчёта.

Ядро не знает месяц, календарь, Task, PWE, UTP.
Снимок = дерево + часы плана + списания уже в одном срезе.
Кто нарезал срезы (январь / февраль / всё сразу) — адаптер.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping


@dataclass(frozen=True)
class Entry:
	"""Часы на узле по роли. И план, и списание — одна запись."""

	node: str
	role: str
	hours: float


@dataclass(frozen=True)
class Result:
	"""
	Ответ ядра.

	plan_hours — котёл.
	fact_hours — сколько уже съели.
	consumers  — чьи списания едят котёл.
	assembled_at — узел, где собрали план (своя клетка или сумма детей).
	"""

	node: str
	role: str
	plan_hours: float
	fact_hours: float
	consumers: frozenset[str]
	assembled_at: str


@dataclass(frozen=True)
class Snapshot:
	"""Один срез. Несколько месяцев = несколько снимков."""

	parent_of: Mapping[str, str | None]
	children_of: Mapping[str, tuple[str, ...]]
	# (узел, роль) → часы плана в этом срезе
	plan: Mapping[tuple[str, str], float]
	used: tuple[Entry, ...]

	@staticmethod
	def build(
		*,
		parent_of: Mapping[str, str | None],
		plan: Iterable[Entry] = (),
		used: Iterable[Entry] = (),
	) -> Snapshot:
		"""parent_of: узел → родитель (у корня None)."""
		children: dict[str, list[str]] = {}
		parents = dict(parent_of)
		for node, parent in parent_of.items():
			children.setdefault(node, [])
			if parent is None:
				continue
			parents.setdefault(parent, parents.get(parent))
			children.setdefault(parent, [])
			if node not in children[parent]:
				children[parent].append(node)

		plan_index: dict[tuple[str, str], float] = {}
		for row in plan:
			if row.hours <= 0:
				continue
			key = (row.node, row.role)
			plan_index[key] = plan_index.get(key, 0.0) + float(row.hours)
			_ensure_node(parents, children, row.node)

		used_rows = tuple(used)
		for row in used_rows:
			_ensure_node(parents, children, row.node)

		return Snapshot(
			parent_of=parents,
			children_of={key: tuple(vals) for key, vals in children.items()},
			plan=plan_index,
			used=used_rows,
		)

	def own_plan(self, node: str, role: str) -> float:
		"""Своя клетка в этом срезе. 0 — клетки нет, смотрим детей / родителя."""
		return float(self.plan.get((node, role), 0.0))

	def parent(self, node: str) -> str | None:
		return self.parent_of.get(node)

	def children(self, node: str) -> tuple[str, ...]:
		return self.children_of.get(node, ())

	def descendants(self, node: str) -> frozenset[str]:
		found: list[str] = []
		stack = list(self.children(node))
		seen = {node}
		while stack:
			child = stack.pop()
			if child in seen:
				continue
			seen.add(child)
			found.append(child)
			stack.extend(self.children(child))
		return frozenset(found)

	def subtree(self, node: str) -> frozenset[str]:
		return frozenset({node}) | self.descendants(node)


def _ensure_node(
	parents: dict[str, str | None],
	children: dict[str, list[str]],
	node: str,
) -> None:
	children.setdefault(node, [])
	parents.setdefault(node, parents.get(node))
