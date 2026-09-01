# Copyright (c) 2026, Dinext
"""Roll plan hours up the Task.parent_task tree (same user + role)."""

from __future__ import annotations

from typing import Any


def _num(value: Any) -> float:
	try:
		n = float(value or 0)
	except (TypeError, ValueError):
		return 0.0
	return n if n == n else 0.0


def rollup_task_period_hours(
	task_id: str,
	*,
	tasks_dict: dict,
	task_results: dict,
	user_email: str,
	role: str,
	period_keys: list[str],
	memo: dict | None = None,
) -> dict[str, float]:
	"""Own PWA hours + all descendants. Does not stop at has_direct_load."""
	if memo is None:
		memo = {}
	if task_id in memo:
		return memo[task_id]

	out = {key: 0.0 for key in period_keys}
	own = task_results.get(f"{user_email}_{role}_{task_id}") or {}
	for key in period_keys:
		out[key] = _num(own.get(key))

	children = (tasks_dict.get(task_id) or {}).get("children") or []
	for child_id in children:
		child = rollup_task_period_hours(
			child_id,
			tasks_dict=tasks_dict,
			task_results=task_results,
			user_email=user_email,
			role=role,
			period_keys=period_keys,
			memo=memo,
		)
		for key in period_keys:
			out[key] += child.get(key, 0.0)

	memo[task_id] = out
	return out


def period_map_has_hours(period_map: dict | None) -> bool:
	if not period_map:
		return False
	return any(_num(value) > 0 for value in period_map.values())
