# Copyright (c) 2026, Dinext
"""Ёмкость графика вкладки Загрузка: фонд команды проекта (ISS-2026-02108)."""

from __future__ import annotations

from collections import defaultdict
from datetime import date

import frappe

from project_workload_assignment.project_workload_assignment.project_workload.core.team_limits import (
	capped_sum_limit,
	date_in_team_row,
	resolve_person_limits,
	row_overlaps_window,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.types import (
	DEFAULT_HOURS_ON_DATE,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.worker_wtype_helpers import (
	resolve_wtype,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.workload_engine import (
	WorkloadContext,
)


def load_team_capacity_rows(
	project: str,
	window_start: date | None,
	window_end: date | None,
) -> list[dict]:
	if not project:
		return []
	meta = frappe.get_meta("Project Team Details")
	fields = [
		"name",
		"pt_participant",
		"pt_role",
		"pt_valid_from",
		"pt_valid_for",
		"worker_type",
	]
	if meta.has_field("workload_limit"):
		fields.append("workload_limit")
	if meta.has_field("virtual_worker"):
		fields.append("virtual_worker")
	for extra in (
		"virtual_holiday_list",
		"virtual_working_hours_on_date",
		"virtual_hours_on_date",
	):
		if meta.has_field(extra):
			fields.append(extra)

	rows = frappe.get_all(
		"Project Team Details",
		filters={"parent": project, "parenttype": "Project"},
		fields=fields,
		limit_page_length=0,
	)
	return [row for row in rows if row_overlaps_window(row, window_start, window_end)]


def real_team_emails(rows: list[dict]) -> list[str]:
	emails: set[str] = set()
	for row in rows:
		if row.get("virtual_worker"):
			continue
		email = (row.get("pt_participant") or "").strip()
		if email:
			emails.add(email)
	return sorted(emails)


def collect_virtual_calendar_refs(rows: list[dict]) -> tuple[set[str], set[str]]:
	"""Holiday List и Working Hours On Date со строк виртуалов."""
	holidays: set[str] = set()
	whods: set[str] = set()
	for row in rows or []:
		if not row.get("virtual_worker"):
			continue
		holiday = (row.get("virtual_holiday_list") or "").strip()
		if holiday:
			holidays.add(holiday)
		whod = (row.get("virtual_working_hours_on_date") or "").strip()
		if whod:
			whods.add(whod)
	return holidays, whods


def _virtual_base_hours(row: dict | None) -> float:
	raw = (row or {}).get("virtual_hours_on_date")
	if raw is None or raw == "":
		return float(DEFAULT_HOURS_ON_DATE)
	try:
		hours = float(raw)
	except (TypeError, ValueError):
		return float(DEFAULT_HOURS_ON_DATE)
	if hours <= 0:
		return float(DEFAULT_HOURS_ON_DATE)
	return hours


def _virtual_holiday_list(row: dict | None, project_data: dict) -> str | None:
	holiday = ((row or {}).get("virtual_holiday_list") or "").strip()
	if holiday:
		return holiday
	return project_data.get("effective_holiday_list") or project_data.get("holiday_list")


def _virtual_whod_ref(row: dict | None, project_data: dict) -> str | None:
	ref = ((row or {}).get("virtual_working_hours_on_date") or "").strip()
	if ref:
		return ref
	return project_data.get("working_hours_on_date") or project_data.get(
		"company_working_hours_on_date"
	)


def virtual_available_hours(
	date_str: str,
	project: str,
	wl_ctx: WorkloadContext,
	row: dict | None = None,
) -> float:
	"""Фонд виртуала: holiday строки/проекта/компании → 0; иначе short-day WHOD; иначе hours_on_date/8."""
	project_data = wl_ctx.projects_data.get(project) or {}
	holiday_list = _virtual_holiday_list(row, project_data)
	if holiday_list:
		dates = wl_ctx.holiday_date_sets.get(holiday_list) or {}
		if date_str in dates:
			return 0.0
	hours = _virtual_base_hours(row)
	ref = _virtual_whod_ref(row, project_data)
	if ref:
		override_dict = (getattr(wl_ctx, "working_hours_overrides", None) or {}).get(ref) or {}
		if date_str in override_dict:
			hours = float(override_dict[date_str])
	return hours


def _person_key(row: dict) -> str | None:
	if row.get("virtual_worker"):
		email = (row.get("pt_participant") or "").strip()
		return f"virtual::{email or row.get('name') or ''}"
	email = (row.get("pt_participant") or "").strip()
	if not email:
		return None
	return f"user::{email}"


def _row_matches_roles(row: dict, role_filters: list[str] | None) -> bool:
	if not role_filters:
		return True
	return (row.get("pt_role") or "").strip() in role_filters


def _real_wtype_ok(email: str, users_data: dict, wtypes_map: dict, worker_wtype: str | None) -> bool:
	if not worker_wtype:
		return True
	return resolve_wtype(email, users_data, wtypes_map) == worker_wtype


def _virtual_wtype_ok(row: dict, worker_wtype: str | None) -> bool:
	if not worker_wtype:
		return True
	return (row.get("worker_type") or "").strip() == worker_wtype


def _add_daily_to_periods(
	daily_hours: dict[str, float],
	date_to_period_key: dict[str, str],
	period_index: dict[str, int],
	target: list[float],
) -> None:
	for date_str, hours in daily_hours.items():
		period_key = date_to_period_key.get(date_str)
		if period_key is None:
			continue
		idx = period_index.get(period_key)
		if idx is None:
			continue
		target[idx] += float(hours)


def compute_team_capacity_series(
	project: str,
	rows: list[dict],
	wl_ctx: WorkloadContext,
	date_to_period_key: dict[str, str],
	period_index: dict[str, int],
	*,
	consider_virtuals: bool,
	worker_wtype: str | None,
	role_filters: list[str] | None,
	users_data: dict | None = None,
	wtypes_map: dict | None = None,
	period_count: int,
) -> tuple[list[float], list[float]]:
	gross = [0.0] * period_count
	net = [0.0] * period_count
	if not project or not date_to_period_key:
		return gross, net

	users_data = users_data or {}
	wtypes_map = wtypes_map or {}
	by_person: dict[str, list[dict]] = defaultdict(list)
	for row in rows:
		is_virtual = bool(row.get("virtual_worker"))
		if is_virtual and not consider_virtuals:
			continue
		if is_virtual and not _virtual_wtype_ok(row, worker_wtype):
			continue
		key = _person_key(row)
		if not key:
			continue
		if not is_virtual:
			email = key[6:]
			if not _real_wtype_ok(email, users_data, wtypes_map, worker_wtype):
				continue
		by_person[key].append(row)

	for person_key, person_rows in by_person.items():
		is_virtual = person_key.startswith("virtual::")
		email = person_key[6:] if person_key.startswith("user::") else ""
		daily_gross: dict[str, float] = {}
		daily_net: dict[str, float] = {}
		for date_str in date_to_period_key:
			active = [
				row
				for row in person_rows
				if date_in_team_row(row, date_str) and _row_matches_roles(row, role_filters)
			]
			if not active:
				continue
			if is_virtual:
				hours = virtual_available_hours(date_str, project, wl_ctx, active[0])
			else:
				hours = wl_ctx.get_available_hours(date_str, email, project)
			if hours <= 0:
				continue
			by_role: dict[str, float] = {}
			for row, limit in zip(active, resolve_person_limits(active)):
				role = (row.get("pt_role") or "").strip()
				prev = by_role.get(role)
				if prev is None or limit < prev:
					by_role[role] = limit
			factor = capped_sum_limit(list(by_role.values())) / 100.0
			daily_gross[date_str] = hours
			daily_net[date_str] = hours * factor
		_add_daily_to_periods(daily_gross, date_to_period_key, period_index, gross)
		_add_daily_to_periods(daily_net, date_to_period_key, period_index, net)

	return gross, net
