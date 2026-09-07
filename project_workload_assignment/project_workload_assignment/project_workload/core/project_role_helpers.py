# Copyright (c) 2026, Dinext
"""Фильтрация PWA.role / опции ролей для PWR (ISS-2026-02657)."""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.query_builder.functions import IfNull


def normalize_project_role_filters(value: Any) -> list[str]:
	"""Пусто / all → []; иначе unique non-empty role names."""
	if value is None:
		return []
	if isinstance(value, str):
		text = value.strip()
		if not text or text.lower() in {"all", "все"}:
			return []
		if text.startswith("["):
			try:
				parsed = frappe.parse_json(text)
			except Exception:
				parsed = None
			if parsed is not None:
				return normalize_project_role_filters(parsed)
		items = [item.strip() for item in text.split(",") if item and item.strip()]
	elif isinstance(value, (list, tuple, set)):
		items = [str(item).strip() for item in value if str(item).strip()]
	else:
		items = [str(value).strip()] if str(value).strip() else []

	out: list[str] = []
	seen: set[str] = set()
	for item in items:
		if not item or item in seen:
			continue
		seen.add(item)
		out.append(item)
	return out


def apply_project_role_to_pwr_query(q: Any, PWA: Any, project_role_filters: Any = None) -> Any:
	"""SQL-фильтр PWA.role; пустой список = без фильтра."""
	roles = normalize_project_role_filters(project_role_filters)
	if not roles:
		return q
	return q.where(IfNull(PWA.role, "") != "").where(PWA.role.isin(roles))


def filter_assignments_by_project_role(
	assignments: list[dict],
	project_role_filters: Any = None,
) -> list[dict]:
	roles = normalize_project_role_filters(project_role_filters)
	if not roles:
		return assignments
	role_set = set(roles)
	return [a for a in assignments if (a.get("role") or "") in role_set]


def _options_payload(values: list[str]) -> list[dict[str, str]]:
	return [{"label": value, "value": value, "description": ""} for value in values]


def options_from_project_team(project: str) -> list[dict[str, str]]:
	"""Строго роли проекта (Project Team Details.pt_role)."""
	if not project:
		return []
	if not frappe.has_permission("Project", "read", project):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	rows = frappe.get_all(
		"Project Team Details",
		filters={"parent": project, "parenttype": "Project", "parentfield": "custom_ts_details"},
		fields=["pt_role"],
		limit_page_length=0,
	)
	values = sorted(
		{(row.get("pt_role") or "").strip() for row in rows if (row.get("pt_role") or "").strip()}
	)
	return _options_payload(values)


def options_from_pwr_scope(
	*,
	window_start: str,
	window_end: str,
	user: str | None = None,
	project: str | None = None,
	project_portfolio: str | None = None,
	user_group: str | None = None,
	worker_wtype_filter: str | None = None,
) -> list[dict[str, str]]:
	"""Distinct PWA.role в scope общего отчёта (пользователи/проекты окна)."""
	from project_workload_assignment.project_workload_assignment.project_workload.core.assignments import (
		build_pwr_assignment_base_query,
	)

	use_sql_ug = bool(user_group)
	q, PWA, _Task = build_pwr_assignment_base_query(
		window_start,
		window_end,
		user=user or None,
		project=project or None,
		project_portfolio=project_portfolio or None,
		user_group_parent=user_group or None,
		use_sql_user_group_join=use_sql_ug,
		worker_wtype_filter=worker_wtype_filter,
	)
	rows = (
		q.select(PWA.role.as_("role"))
		.distinct()
		.where(IfNull(PWA.role, "") != "")
		.orderby(PWA.role)
		.run(as_dict=True)
	)
	values = [(row.get("role") or "").strip() for row in rows if (row.get("role") or "").strip()]
	return _options_payload(values)
