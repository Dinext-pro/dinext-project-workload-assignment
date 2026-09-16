# Copyright (c) 2026, Dinext
"""Лимит загрузки с Project Team Details (ISS-2026-02108)."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

import frappe
from frappe.utils import getdate

FULL_FUND_LIMIT = 100.0


def _row_get(row, key):
	"""Dict или Document: `.get` сначала, иначе getattr. Без `row[key]`."""
	getter = getattr(row, "get", None)
	if callable(getter):
		return getter(key)
	return getattr(row, key, None)


def normalize_workload_limit(value) -> float:
	"""Пустое / 0 / мусор → 100 (полный фонд)."""
	try:
		n = float(value)
	except (TypeError, ValueError):
		return FULL_FUND_LIMIT
	if n <= 0:
		return FULL_FUND_LIMIT
	return n


def date_in_team_row(row: dict, day: date | str | None) -> bool:
	"""День внутри pt_valid_from/for. Пустая граница — без ограничения."""
	if not day:
		return False
	target = getdate(day)
	raw_start = _row_get(row, "pt_valid_from")
	raw_end = _row_get(row, "pt_valid_for")
	start = getdate(raw_start) if raw_start else None
	end = getdate(raw_end) if raw_end else None
	if start and target < start:
		return False
	if end and target > end:
		return False
	return True


def capped_sum_limit(role_limits: list[float]) -> float:
	"""Страховка графика: net не выше полного фонда. 0 остаётся 0 (уже resolved)."""
	total = 0.0
	for value in role_limits:
		try:
			total += float(value)
		except (TypeError, ValueError):
			total += FULL_FUND_LIMIT
	return min(FULL_FUND_LIMIT, total)


def _row_interval(row: dict) -> tuple[date, date]:
	raw_start = _row_get(row, "pt_valid_from")
	raw_end = _row_get(row, "pt_valid_for")
	start = getdate(raw_start) if raw_start else date.min
	end = getdate(raw_end) if raw_end else date.max
	return start, end


def _row_set(row, key, value) -> None:
	"""Dict или Document: `set` / setattr, не `row[key]=` на Document без `__setitem__`."""
	if isinstance(row, dict):
		row[key] = value
		return
	setter = getattr(row, "set", None)
	if callable(setter):
		setter(key, value)
		return
	setattr(row, key, value)


def person_key(row: dict) -> str | None:
	if _row_get(row, "virtual_worker"):
		return None
	return (
		(_row_get(row, "pt_participant") or "").strip()
		or (_row_get(row, "pt_worker") or "").strip()
		or None
	)


def is_explicit_limit(value) -> bool:
	"""None / "" / 100 (дефолт поля) — не явное. 0 на мульти-роли явное 0%."""
	if value is None:
		return False
	if isinstance(value, str) and value.strip() == "":
		return False
	try:
		number = float(value)
	except (TypeError, ValueError):
		return False
	if abs(number - FULL_FUND_LIMIT) < 1e-6:
		return False
	return True


def _intervals_overlap(left, right) -> bool:
	left_start, left_end = _row_interval(left)
	right_start, right_end = _row_interval(right)
	return left_start <= right_end and right_start <= left_end


def _overlap_components(rows: list) -> list[list]:
	"""Компоненты связности: интервалы, которые пересекаются напрямую или через цепочку."""
	count = len(rows)
	parent = list(range(count))

	def find(index: int) -> int:
		while parent[index] != index:
			parent[index] = parent[parent[index]]
			index = parent[index]
		return index

	for i in range(count):
		for j in range(i + 1, count):
			if _intervals_overlap(rows[i], rows[j]):
				root_i, root_j = find(i), find(j)
				if root_i != root_j:
					parent[root_j] = root_i

	groups: dict[int, list] = defaultdict(list)
	for index, row in enumerate(rows):
		groups[find(index)].append(row)
	return list(groups.values())


def _resolve_component(rows: list) -> list[float]:
	"""Остаток до 100 на пустые в одном overlap-кластере. Одна строка: 0/пусто → 100."""
	if not rows:
		return []
	if len(rows) == 1:
		return [normalize_workload_limit(_row_get(rows[0], "workload_limit"))]

	resolved: list[float] = [0.0] * len(rows)
	empty_indexes: list[int] = []
	explicit_sum = 0.0
	for index, row in enumerate(rows):
		value = _row_get(row, "workload_limit")
		if is_explicit_limit(value):
			number = float(value)
			resolved[index] = number
			explicit_sum += number
		else:
			empty_indexes.append(index)

	if not empty_indexes:
		return resolved

	remaining = FULL_FUND_LIMIT - explicit_sum
	if remaining < -1e-6:
		return resolved

	empty_count = len(empty_indexes)
	share = round(remaining / empty_count, 2)
	for offset, index in enumerate(empty_indexes):
		if offset == empty_count - 1:
			resolved[index] = round(remaining - share * (empty_count - 1), 2)
		else:
			resolved[index] = share
	return resolved


def resolve_person_limits(rows: list) -> list[float]:
	"""Числовые лимиты по индексу `rows`. Виртуальные / без человека — normalize."""
	result: list[float] = [FULL_FUND_LIMIT] * len(rows or [])
	if not rows:
		return result

	by_person: dict[str, list[int]] = defaultdict(list)
	for index, row in enumerate(rows):
		key = person_key(row)
		if not key:
			result[index] = normalize_workload_limit(_row_get(row, "workload_limit"))
			continue
		by_person[key].append(index)

	identity: dict[int, int] = {id(rows[index]): index for index in range(len(rows))}
	for indexes in by_person.values():
		person_rows = [rows[index] for index in indexes]
		for component in _overlap_components(person_rows):
			filled = _resolve_component(component)
			for row, value in zip(component, filled):
				result[identity[id(row)]] = value
	return result


def fill_person_limit_remainders(rows: list) -> bool:
	"""Пишет resolved пустые / одноролевой 0→100. True, если меняли."""
	changed = False
	by_person: dict[str, list] = defaultdict(list)
	for row in rows or []:
		key = person_key(row)
		if key:
			by_person[key].append(row)
	for person_rows in by_person.values():
		for component in _overlap_components(person_rows):
			if len(component) > 1:
				explicit_sum = sum(
					float(_row_get(row, "workload_limit"))
					for row in component
					if is_explicit_limit(_row_get(row, "workload_limit"))
				)
				if FULL_FUND_LIMIT - explicit_sum < -1e-6:
					continue
			filled = _resolve_component(component)
			for row, value in zip(component, filled):
				current = _row_get(row, "workload_limit")
				if is_explicit_limit(current) and abs(float(current) - value) < 1e-6:
					continue
				_row_set(row, "workload_limit", value)
				changed = True
	return changed


def autobalance_default_limit_rows(rows: list) -> bool:
	"""Совместимость: раньше 50/50 дефолтов, теперь remainder fill."""
	return fill_person_limit_remainders(rows)


def peak_limit_sum(rows: list) -> float:
	"""Максимум суммы resolved-лимитов по дням (конец периода включительно)."""
	events: list[tuple[date, int, float]] = []
	for row, limit in zip(rows or [], resolve_person_limits(rows)):
		start, end = _row_interval(row)
		events.append((start, 1, limit))
		remove_on = end if end == date.max else end + timedelta(days=1)
		events.append((remove_on, -1, limit))
	events.sort(key=lambda item: (item[0], item[1]))
	current = 0.0
	peak = 0.0
	for _, sign, limit in events:
		current += sign * limit
		if current > peak:
			peak = current
	return peak


def _row_limit_label(row) -> str:
	return (
		(_row_get(row, "pt_role") or "").strip()
		or (_row_get(row, "pt_participant") or "").strip()
		or (_row_get(row, "pt_worker") or "").strip()
		or "virtual"
	)


def find_team_limit_ceiling_violations(rows: list) -> list[dict]:
	"""Любая строка (реал или виртуал) с числом > 100. Пустое / 0 / 100 — не потолок."""
	violations: list[dict] = []
	for row in rows or []:
		value = _row_get(row, "workload_limit")
		if value is None or (isinstance(value, str) and value.strip() == ""):
			continue
		try:
			number = float(value)
		except (TypeError, ValueError):
			continue
		if number > FULL_FUND_LIMIT + 1e-6:
			violations.append(
				{"person": _row_limit_label(row), "peak": number, "rows": [row]}
			)
	return violations


def find_team_limit_sum_violations(rows: list) -> list[dict]:
	"""Пик суммы лимитов одного человека > 100 на пересекающихся датах."""
	by_person: dict[str, list] = defaultdict(list)
	for row in rows or []:
		key = person_key(row)
		if key:
			by_person[key].append(row)
	violations: list[dict] = []
	for key, group in by_person.items():
		if len(group) < 2:
			continue
		peak = peak_limit_sum(group)
		if peak > FULL_FUND_LIMIT + 1e-6:
			violations.append({"person": key, "peak": peak, "rows": group})
	return violations


def validate_project_team_limit_sum(doc, method=None) -> None:
	meta = frappe.get_meta("Project Team Details")
	if not meta.has_field("workload_limit"):
		return
	rows = doc.get("custom_ts_details") or []
	fill_person_limit_remainders(rows)
	ceiling = find_team_limit_ceiling_violations(rows)
	sums = find_team_limit_sum_violations(rows)
	if not ceiling and not sums:
		return
	lines: list[str] = []
	if ceiling:
		lines.append(frappe._("Workload limit of one role cannot exceed 100%."))
		for item in ceiling:
			lines.append(
				frappe._("{0}: {1}% (max 100%)").format(
					item["person"], frappe.utils.flt(item["peak"], 2)
				)
			)
	if sums:
		lines.append(
			frappe._(
				"Workload limit of one person cannot exceed 100% on overlapping dates."
			)
		)
		for item in sums:
			lines.append(
				frappe._("{0}: {1}% (max 100%)").format(
					item["person"], frappe.utils.flt(item["peak"], 2)
				)
			)
	frappe.throw("<br>".join(lines), title=frappe._("Workload limit"))


def row_overlaps_window(row: dict, window_start: date | None, window_end: date | None) -> bool:
	raw_start = _row_get(row, "pt_valid_from")
	raw_end = _row_get(row, "pt_valid_for")
	start = getdate(raw_start) if raw_start else None
	end = getdate(raw_end) if raw_end else None
	window_start = getdate(window_start) if window_start else None
	window_end = getdate(window_end) if window_end else None
	if start and window_end and start > window_end:
		return False
	if end and window_start and end < window_start:
		return False
	return True


def load_project_team_limits(
	project: str,
	window_start: date | None,
	window_end: date | None,
) -> dict[tuple[str, str], float]:
	"""`(pt_participant, pt_role)` → min limit в окне. Виртуальные строки пропускает."""
	result: dict[tuple[str, str], float] = {}
	if not project:
		return result
	meta = frappe.get_meta("Project Team Details")
	if not meta.has_field("workload_limit"):
		return result

	fields = ["pt_participant", "pt_role", "workload_limit", "pt_valid_from", "pt_valid_for"]
	if meta.has_field("virtual_worker"):
		fields.append("virtual_worker")

	rows = frappe.get_all(
		"Project Team Details",
		filters={"parent": project, "parenttype": "Project"},
		fields=fields,
		limit_page_length=0,
	)
	for row in rows:
		if row.get("virtual_worker"):
			continue
		user = (row.get("pt_participant") or "").strip()
		role = (row.get("pt_role") or "").strip()
		if not user or not role:
			continue
		if not row_overlaps_window(row, window_start, window_end):
			continue
		limit = normalize_workload_limit(row.get("workload_limit"))
		key = (user, role)
		prev = result.get(key)
		if prev is None or limit < prev:
			result[key] = limit
	return result


def resolve_role_limit(
	limits_map: dict[tuple[str, str], float],
	user_email: str,
	role: str,
) -> float:
	return limits_map.get((user_email or "", role or ""), FULL_FUND_LIMIT)


def resolve_user_limit(
	limits_map: dict[tuple[str, str], float],
	user_email: str,
	roles: list[str],
) -> float:
	"""User-строка таблицы: сумма лимитов ролей, cap 100. Как person factor графика."""
	values = [resolve_role_limit(limits_map, user_email, role) for role in roles]
	return capped_sum_limit(values) if values else FULL_FUND_LIMIT
