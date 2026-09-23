# Copyright (c) 2026, Dinext
"""BulkData → срезы → ядро → поля экрана. Дерево заново не ходим."""

from __future__ import annotations

from dataclasses import dataclass

from project_workload_assignment.project_workload_assignment.plan_fact import (
	Entry,
	PlanFact,
	Result,
	Snapshot,
)
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.bulk_loader import (
	TimesheetLimitsBulkData,
)


@dataclass(frozen=True)
class ScreenPlan:
	plan_hours: float
	fact_hours: float
	consumers: frozenset[str]
	used_parent: bool
	assembled_at: str
	plan_sources: tuple[dict, ...]
	plan_task_subject: str


class TimesheetPlanFactAdapter:
	@classmethod
	def for_screen(
		cls,
		bulk: TimesheetLimitsBulkData,
		project: str,
		task: str,
		role: str,
		year: int | None,
		month: int | None,
		used: list[Entry] | tuple[Entry, ...] = (),
	) -> ScreenPlan | None:
		parent_of, snaps = cls.slices(bulk, project)
		keys = [(year, month)] if year is not None and month is not None else sorted(snaps)
		pairs: list[tuple[Snapshot, Result]] = []
		for key in keys:
			snap = snaps.get(key) or Snapshot.build(parent_of=parent_of, plan=[])
			got = cls._compute(bulk, snap, task, role)
			if got:
				pairs.append((snap, got))
		result = PlanFact.fold((got for _snap, got in pairs), used=used)
		if result is None:
			return None
		sources = tuple(
			row
			for snap, got in pairs
			for row in cls._sources(bulk, snap, got)
		)
		used_parent = result.assembled_at != result.node
		if used_parent and sources:
			subject = sources[0]["subject"]
		else:
			subject = bulk.task_meta.get(task, {}).get("subject", task)
		return ScreenPlan(
			plan_hours=result.plan_hours,
			fact_hours=result.fact_hours,
			consumers=result.consumers,
			used_parent=used_parent,
			assembled_at=result.assembled_at,
			plan_sources=sources,
			plan_task_subject=subject,
		)

	@classmethod
	def result(
		cls,
		bulk: TimesheetLimitsBulkData,
		project: str,
		task: str,
		role: str,
		year: int | None = None,
		month: int | None = None,
		hours_key: str = "plan",
	) -> Result | None:
		parent_of, snaps = cls.slices(bulk, project, hours_key=hours_key)
		keys = [(year, month)] if year is not None and month is not None else sorted(snaps)
		return PlanFact.fold(
			cls._compute(
				bulk,
				snaps.get(key) or Snapshot.build(parent_of=parent_of, plan=[]),
				task,
				role,
			)
			for key in keys
		)

	@classmethod
	def hours_by_role(
		cls,
		bulk: TimesheetLimitsBulkData,
		project: str,
		task: str,
		roles: list[str] | None = None,
		hours_key: str = "plan",
	) -> dict[str, float]:
		wanted = list(roles) if roles else cls._roles(bulk, project)
		out: dict[str, float] = {}
		for role in wanted:
			got = cls.result(bulk, project, task, role, hours_key=hours_key)
			if got:
				out[role] = got.plan_hours
		return out

	@classmethod
	def consumers_for(
		cls,
		bulk: TimesheetLimitsBulkData,
		project: str,
		task: str,
		roles: list[str] | None = None,
		hours_key: str = "plan",
	) -> frozenset[str]:
		wanted = list(roles) if roles else cls._roles(bulk, project)
		consumers: set[str] = set()
		for role in wanted:
			got = cls.result(bulk, project, task, role, hours_key=hours_key)
			if got:
				consumers.update(got.consumers)
		return frozenset(consumers) if consumers else frozenset({task})

	@classmethod
	def assembled_node(
		cls,
		bulk: TimesheetLimitsBulkData,
		project: str,
		task: str,
		role: str,
		hours_key: str = "plan",
	) -> str | None:
		got = cls.result(bulk, project, task, role, hours_key=hours_key)
		return got.assembled_at if got else None

	@staticmethod
	def _roles(bulk: TimesheetLimitsBulkData, project: str) -> list[str]:
		return sorted(
			{role for (proj, _task, role) in bulk.pwe_by_task_role if proj == project}
		)

	@classmethod
	def _compute(cls, bulk: TimesheetLimitsBulkData, snap: Snapshot, node: str, role: str) -> Result | None:
		"""Повтор того же снимка в этом bulk не обходит дерево заново."""
		sid = id(snap)
		bulk._compute_snaps[sid] = snap
		cache_key = (sid, node, role)
		if cache_key in bulk._compute_cache:
			return bulk._compute_cache[cache_key]
		got = PlanFact.compute(snap, node, role)
		bulk._compute_cache[cache_key] = got
		return got

	@classmethod
	def slices(
		cls,
		bulk: TimesheetLimitsBulkData,
		project: str,
		hours_key: str = "plan",
	) -> tuple[dict[str, str | None], dict[tuple[int, int], Snapshot]]:
		"""Дерево и снимок каждого месяца. Один раз на этот bulk."""
		cache_key = (project, hours_key)
		cached = bulk._slice_cache.get(cache_key)
		if cached is not None:
			return cached
		parent_of = cls._parent_of(bulk, project)
		snaps = {
			month: Snapshot.build(parent_of=parent_of, plan=entries)
			for month, entries in cls._plan_by_month(bulk, project, hours_key).items()
		}
		built = (parent_of, snaps)
		bulk._slice_cache[cache_key] = built
		return built

	@classmethod
	def sum_roots(
		cls,
		bulk: TimesheetLimitsBulkData,
		project: str,
		roles: list[str],
		periods: list[dict],
		hours_key: str = "plan",
	) -> float:
		"""План полоски: котлы корней × роль × месяц, без двойного счёта."""
		if not roles or not periods:
			return 0.0
		_, snaps = cls.slices(bulk, project, hours_key=hours_key)
		total = 0.0
		for period in periods:
			snap = snaps.get((int(period["year"]), int(period["month"])))
			if not snap:
				continue
			for task in cls.root_tasks(bulk):
				for role in roles:
					got = cls._compute(bulk, snap, task, role)
					if got:
						total += got.plan_hours
		return total

	@staticmethod
	def root_tasks(bulk: TimesheetLimitsBulkData) -> list[str]:
		names: list[str] = []
		for name, meta in bulk.task_meta.items():
			parent = meta.get("parent_task")
			if not parent or parent not in bulk.task_meta:
				names.append(name)
		return names

	@staticmethod
	def _parent_of(bulk: TimesheetLimitsBulkData, project: str) -> dict[str, str | None]:
		nodes: set[str] = set()
		for (proj, task), children in bulk.children_map.items():
			if proj != project:
				continue
			nodes.add(task)
			nodes.update(children)
		for proj, task, _role in bulk.pwe_by_task_role:
			if proj == project:
				nodes.add(task)
		return {task: bulk.task_meta.get(task, {}).get("parent_task") for task in nodes}

	@staticmethod
	def _plan_by_month(
		bulk: TimesheetLimitsBulkData,
		project: str,
		hours_key: str = "plan",
	) -> dict[tuple[int, int], list[Entry]]:
		by_month: dict[tuple[int, int], list[Entry]] = {}
		for (proj, task, role), pwe_names in bulk.pwe_by_task_role.items():
			if proj != project:
				continue
			for pwe_name in pwe_names:
				for amount in bulk.pwe_amounts.get(pwe_name, []):
					hours = float(amount.get(hours_key) or 0)
					if hours <= 0:
						continue
					key = (int(amount["year"]), int(amount["month"]))
					by_month.setdefault(key, []).append(Entry(task, role, hours))
		return by_month

	@classmethod
	def _sources(cls, bulk: TimesheetLimitsBulkData, snap: Snapshot, got: Result) -> list[dict]:
		if snap.own_plan(got.node, got.role) > 0:
			return []
		at = got.assembled_at
		if at != got.node:
			own = snap.own_plan(at, got.role)
			if own > 0:
				return [cls._source_row(bulk, at, own)]
			return cls._child_sources(bulk, snap, at, got.role)
		return cls._child_sources(bulk, snap, got.node, got.role)

	@classmethod
	def _child_sources(
		cls, bulk: TimesheetLimitsBulkData, snap: Snapshot, node: str, role: str
	) -> list[dict]:
		rows: list[dict] = []
		for child in snap.children(node):
			child_got = cls._compute(bulk, snap, child, role)
			if child_got and child_got.assembled_at == child:
				rows.append(cls._source_row(bulk, child, child_got.plan_hours))
		return rows

	@staticmethod
	def _source_row(bulk: TimesheetLimitsBulkData, task: str, hours: float) -> dict:
		return {
			"task_name": task,
			"subject": bulk.task_meta.get(task, {}).get("subject", task),
			"planned_hours": hours,
		}
