# Copyright (c) 2026, Dinext
"""Фактические часы из согласованных UTP для загрузки команды (ISS-2026-00709)."""

from __future__ import annotations

from typing import TypedDict

import frappe
from frappe.query_builder.functions import IfNull, Sum
from frappe.utils import flt, getdate

from dinext_timesheets.timesheet_status import APPROVED_POSITION_STATUSES
from project_workload_assignment.project_workload_assignment.project_workload.core.periods import (
	PWRPeriod,
	build_date_to_period_key,
)

WORKER_WTYPES = ("Employee", "Supplier")


class UtpDailyRow(TypedDict, total=False):
	user: str
	project: str
	task: str
	project_role: str
	date: str
	hours: float


def query_utp_daily_rows(
	date_from: str,
	date_to: str,
	*,
	projects: list[str] | None = None,
	users: list[str] | None = None,
) -> list[UtpDailyRow]:
	"""Согласованные UTP (Task) по проектам/пользователям в диапазоне дат."""
	if not projects or not users:
		return []

	utp = frappe.qb.DocType("User Timesheet Position")
	detail = frappe.qb.DocType("User Timesheet Position Details")
	q = (
		frappe.qb.from_(utp)
		.inner_join(detail)
		.on(detail.parent == utp.name)
		.select(
			utp.user,
			utp.project,
			IfNull(utp.document_name, "").as_("task"),
			IfNull(utp.project_role, "").as_("project_role"),
			detail.date,
			Sum(IfNull(detail.hours, 0)).as_("hours"),
		)
		.where(utp.project.isin(list(projects)))
		.where(utp.user.isin(list(users)))
		.where(utp.status.isin(APPROVED_POSITION_STATUSES))
		.where(IfNull(utp.document_type, "") == "Task")
		.where(detail.date.between(date_from, date_to))
		.groupby(utp.user, utp.project, utp.document_name, utp.project_role, detail.date)
	)
	rows = q.run(as_dict=True)
	return [
		UtpDailyRow(
			user=row.get("user") or "",
			project=row.get("project") or "",
			task=row.get("task") or "",
			project_role=(row.get("project_role") or "").strip(),
			date=str(row.get("date")),
			hours=flt(row.get("hours")),
		)
		for row in rows
		if row.get("user") and row.get("project") and flt(row.get("hours")) > 0
	]


def _period_window(periods: list[PWRPeriod], view_type: str) -> tuple[str, str]:
	from project_workload_assignment.project_workload_assignment.project_workload.core.windows import (
		get_visible_window,
	)

	display_start, display_end = get_visible_window(periods, view_type)
	return str(display_start), str(display_end)


def _ensure_user_project_bucket(store: dict, user: str, project: str) -> dict:
	if user not in store:
		store[user] = {}
	if project not in store[user]:
		store[user][project] = {}
	return store[user][project]


def merge_user_actual_totals(actual_by_user_project: dict, user: str) -> dict[str, float]:
	"""Суммирует факт по всем проектам пользователя в totals по period_key."""
	merged: dict[str, float] = {}
	for period_map in (actual_by_user_project.get(user) or {}).values():
		if not isinstance(period_map, dict):
			continue
		for period_key, hours in period_map.items():
			merged[period_key] = merged.get(period_key, 0.0) + flt(hours)
	return merged


def compute_team_actual_hours(
	assignments: list[dict],
	periods: list[PWRPeriod],
	view_type: str,
	*,
	direct_user_totals: bool = False,
) -> dict:
	"""Факт по той же схеме, что plan results: user→period или user→project→period."""
	if not assignments or not periods:
		return {}

	assignment_pairs = {
		(a.get("user"), a.get("project_name"))
		for a in assignments
		if a.get("user") and a.get("project_name")
	}
	if not assignment_pairs:
		return {}

	projects = sorted({pair[1] for pair in assignment_pairs})
	users = sorted({pair[0] for pair in assignment_pairs})
	date_from, date_to = _period_window(periods, view_type)
	date_to_period_key = build_date_to_period_key(periods, view_type)

	store: dict = {}
	for row in query_utp_daily_rows(date_from, date_to, projects=projects, users=users):
		pair = (row["user"], row["project"])
		if pair not in assignment_pairs:
			continue
		period_key = date_to_period_key.get(row["date"])
		if not period_key:
			continue
		bucket = _ensure_user_project_bucket(store, row["user"], row["project"])
		bucket[period_key] = bucket.get(period_key, 0.0) + flt(row["hours"])

	return store


def compute_project_actual_hours(
	project: str,
	periods: list[PWRPeriod],
	view_type: str,
	users: list[str] | None = None,
) -> tuple[dict[str, dict[str, float]], dict[str, dict[str, dict[str, float]]]]:
	"""(user→period, user→task→period) для дерева загрузки проекта."""
	if not project or not periods:
		return {}, {}

	date_from, date_to = _period_window(periods, view_type)
	date_to_period_key = build_date_to_period_key(periods, view_type)
	user_filter = set(users) if users else None

	by_user: dict[str, dict[str, float]] = {}
	by_user_task: dict[str, dict[str, dict[str, float]]] = {}

	rows = query_utp_daily_rows(
		date_from,
		date_to,
		projects=[project],
		users=list(user_filter) if user_filter else _users_with_utp_on_project(project, date_from, date_to),
	)
	for row in rows:
		if user_filter and row["user"] not in user_filter:
			continue
		period_key = date_to_period_key.get(row["date"])
		if not period_key:
			continue
		hours = flt(row["hours"])
		by_user.setdefault(row["user"], {})
		by_user[row["user"]][period_key] = by_user[row["user"]].get(period_key, 0.0) + hours
		if row.get("task"):
			by_user_task.setdefault(row["user"], {})
			by_user_task[row["user"]].setdefault(row["task"], {})
			task_bucket = by_user_task[row["user"]][row["task"]]
			task_bucket[period_key] = task_bucket.get(period_key, 0.0) + hours

	return by_user, by_user_task


def _users_with_utp_on_project(project: str, date_from: str, date_to: str) -> list[str]:
	utp = frappe.qb.DocType("User Timesheet Position")
	rows = (
		frappe.qb.from_(utp)
		.select(utp.user)
		.distinct()
		.where(utp.project == project)
		.where(utp.status.isin(APPROVED_POSITION_STATUSES))
		.where(IfNull(utp.document_type, "") == "Task")
	).run(as_dict=True)
	return sorted({row["user"] for row in rows if row.get("user")})


def load_utp_hours_by_wtype(
	project: str,
	date_from: str,
	date_to: str,
	wtypes_map: dict[str, str],
	users_data: dict,
	period_count: int,
	date_to_period_key: dict[str, str],
	period_index: dict[str, int],
	worker_wtype_filter: str | None,
	users: list[str] | None = None,
) -> dict[str, list[float]]:
	"""Серии факта по типу worker для графика проекта."""
	series = {wtype: [0.0] * period_count for wtype in WORKER_WTYPES}
	user_list = users or _users_with_utp_on_project(project, date_from, date_to)
	for row in query_utp_daily_rows(date_from, date_to, projects=[project], users=user_list):
		user_email = row.get("user")
		if not user_email:
			continue
		wtype = _resolve_wtype(user_email, users_data, wtypes_map)
		if worker_wtype_filter and wtype != worker_wtype_filter:
			continue
		period_key = date_to_period_key.get(row["date"])
		if period_key is None:
			continue
		idx = period_index.get(period_key)
		if idx is None:
			continue
		series[wtype][idx] += flt(row["hours"])
	return series


def load_team_utp_hours_by_wtype(
	assignments: list[dict],
	periods: list[PWRPeriod],
	view_type: str,
	wtypes_map: dict[str, str],
	users_data: dict,
	worker_wtype_filter: str | None,
) -> dict[str, list[float]]:
	"""Серии факта по типу worker для сводного графика PWR."""
	period_count = len(periods)
	series = {wtype: [0.0] * period_count for wtype in WORKER_WTYPES}
	if not assignments:
		return series

	assignment_pairs = {
		(a.get("user"), a.get("project_name"))
		for a in assignments
		if a.get("user") and a.get("project_name")
	}
	if not assignment_pairs:
		return series

	projects = sorted({pair[1] for pair in assignment_pairs})
	users = sorted({pair[0] for pair in assignment_pairs})
	date_from, date_to = _period_window(periods, view_type)
	date_to_period_key = build_date_to_period_key(periods, view_type)
	period_index = {p["key"]: i for i, p in enumerate(periods)}

	for row in query_utp_daily_rows(date_from, date_to, projects=projects, users=users):
		if (row["user"], row["project"]) not in assignment_pairs:
			continue
		user_email = row["user"]
		wtype = _resolve_wtype(user_email, users_data, wtypes_map)
		if worker_wtype_filter and wtype != worker_wtype_filter:
			continue
		period_key = date_to_period_key.get(row["date"])
		if period_key is None:
			continue
		idx = period_index.get(period_key)
		if idx is None:
			continue
		series[wtype][idx] += flt(row["hours"])
	return series


def _assignment_role_lookups(assignments: list[dict]) -> tuple[dict, dict]:
	"""(user, project, task) → role; (user, project) → role if unique."""
	by_task: dict[tuple[str, str, str], str] = {}
	roles_by_project: dict[tuple[str, str], set[str]] = {}
	for assignment in assignments or []:
		user = assignment.get("user")
		project = assignment.get("project_name") or assignment.get("project")
		if not user or not project:
			continue
		role = (assignment.get("role") or "").strip()
		task = assignment.get("task") or assignment.get("task_id") or ""
		if task:
			by_task[(user, project, task)] = role
		roles_by_project.setdefault((user, project), set()).add(role)
	by_project = {
		key: next(iter(roles))
		for key, roles in roles_by_project.items()
		if len(roles) == 1
	}
	return by_task, by_project


def _resolve_utp_role(row: dict, by_task: dict, by_project: dict) -> str:
	role = (row.get("project_role") or "").strip()
	if role:
		return role
	user = row.get("user") or ""
	project = row.get("project") or ""
	task = row.get("task") or ""
	if task:
		mapped = by_task.get((user, project, task))
		if mapped is not None:
			return mapped
	return by_project.get((user, project), "")


def _add_hours_to_role_series(
	series: dict[str, list[float]],
	role: str,
	idx: int,
	hours: float,
	period_count: int,
) -> None:
	if role not in series:
		series[role] = [0.0] * period_count
	series[role][idx] += hours


def load_team_utp_hours_by_role(
	assignments: list[dict],
	periods: list[PWRPeriod],
	view_type: str,
) -> dict[str, list[float]]:
	"""Серии факта по роли проекта для сводного графика PWR."""
	period_count = len(periods)
	series: dict[str, list[float]] = {}
	if not assignments:
		return series

	assignment_pairs = {
		(a.get("user"), a.get("project_name"))
		for a in assignments
		if a.get("user") and a.get("project_name")
	}
	if not assignment_pairs:
		return series

	projects = sorted({pair[1] for pair in assignment_pairs})
	users = sorted({pair[0] for pair in assignment_pairs})
	date_from, date_to = _period_window(periods, view_type)
	date_to_period_key = build_date_to_period_key(periods, view_type)
	period_index = {p["key"]: i for i, p in enumerate(periods)}
	by_task, by_project = _assignment_role_lookups(assignments)

	for row in query_utp_daily_rows(date_from, date_to, projects=projects, users=users):
		if (row["user"], row["project"]) not in assignment_pairs:
			continue
		period_key = date_to_period_key.get(row["date"])
		if period_key is None:
			continue
		idx = period_index.get(period_key)
		if idx is None:
			continue
		role = _resolve_utp_role(row, by_task, by_project)
		_add_hours_to_role_series(series, role, idx, flt(row["hours"]), period_count)
	return series


def load_utp_hours_by_role(
	project: str,
	date_from: str,
	date_to: str,
	period_count: int,
	date_to_period_key: dict[str, str],
	period_index: dict[str, int],
	users: list[str] | None = None,
	assignments: list[dict] | None = None,
) -> dict[str, list[float]]:
	"""Серии факта по роли проекта для графика вкладки проекта."""
	series: dict[str, list[float]] = {}
	user_list = users or _users_with_utp_on_project(project, date_from, date_to)
	by_task, by_project = _assignment_role_lookups(assignments or [])
	for row in query_utp_daily_rows(date_from, date_to, projects=[project], users=user_list):
		period_key = date_to_period_key.get(row["date"])
		if period_key is None:
			continue
		idx = period_index.get(period_key)
		if idx is None:
			continue
		role = _resolve_utp_role(row, by_task, by_project)
		_add_hours_to_role_series(series, role, idx, flt(row["hours"]), period_count)
	return series


def _resolve_wtype(user_email: str, users_data: dict, wtypes_map: dict[str, str]) -> str:
	wtype = (users_data.get(user_email) or {}).get("wtype") or wtypes_map.get(user_email) or ""
	if wtype in WORKER_WTYPES:
		return wtype
	return "Employee"


def apply_actual_fields_to_row(
	row: dict,
	periods: list[PWRPeriod],
	actual_by_period: dict[str, float],
) -> None:
	actual_total = 0.0
	for period in periods:
		period_key = period["key"]
		actual = flt(actual_by_period.get(period_key, 0.0))
		row[f"{period_key}_actual"] = "%.1f" % actual
		actual_total += actual
	row["actual_total"] = "%.1f" % actual_total


def sum_period_maps(*maps: dict[str, float]) -> dict[str, float]:
	result: dict[str, float] = {}
	for period_map in maps:
		for key, hours in period_map.items():
			result[key] = result.get(key, 0.0) + flt(hours)
	return result
