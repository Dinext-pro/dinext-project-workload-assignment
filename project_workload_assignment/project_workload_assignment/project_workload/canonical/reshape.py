# Copyright (c) 2026, Dinext
"""Legacy PWR wire → canonical GridResponse (nested rows, hours_<key>).

Ports frontend adapt-*.js. Calc modules untouched — only reshape output.
"""

from __future__ import annotations

from typing import Any

from project_workload_assignment.project_workload_assignment.project_workload.project_report.single_project_workload_tree import (
	run_get_project_workload_data,
)
from project_workload_assignment.project_workload_assignment.project_workload.team_report.team_workload_grid import (
	run_get_projects_workload_data_v2,
)


def _to_number_or_none(value: Any) -> float | None:
	if value is None or value == "":
		return None
	try:
		n = float(value)
	except (TypeError, ValueError):
		return None
	return n if n == n else None  # NaN check


def _infer_view_type(p: dict) -> str | None:
	if not p:
		return None
	if p.get("view_type"):
		return str(p["view_type"])
	if p.get("date") and not p.get("start_date"):
		return "daily"
	if p.get("week") is not None:
		return "weekly"
	if p.get("month") is not None and p.get("start_date"):
		return "monthly"
	return None


def period_from_wire(p: Any) -> dict | None:
	if not isinstance(p, dict) or not p.get("key"):
		return None

	view_type = _infer_view_type(p)
	start_date = p.get("start_date") or ""
	end_date = p.get("end_date") or ""
	if (not start_date or not end_date) and p.get("date"):
		start_date = p["date"]
		end_date = p["date"]

	out: dict[str, Any] = {
		"key": str(p["key"]),
		"start_date": start_date,
		"end_date": end_date,
	}
	if view_type:
		out["view_type"] = view_type
	for field in ("label", "date", "year", "month", "week", "day", "weekday"):
		if p.get(field) is not None:
			out[field] = p[field]
	return out


def adapt_periods(raw: Any) -> list[dict]:
	if not isinstance(raw, list):
		return []
	out: list[dict] = []
	for item in raw:
		period = period_from_wire(item)
		if period:
			out.append(period)
	return out


def row_id_for_user(email: str) -> str:
	return f"user:{email or ''}"


def row_id_for_project(project: str, email: str = "") -> str:
	if email:
		return f"project:{email}:{project or ''}"
	return f"project:{project or ''}"


def row_id_for_role(email: str, role: str) -> str:
	return f"role:{email or 'user'}:{role or ''}"


def row_id_for_task(email: str, role: str, task_id: str) -> str:
	return f"task:{email or 'user'}:{role or 'role'}:{task_id or ''}"


def copy_period_scalars(legacy_row: dict, period_keys: list[str]) -> dict:
	out: dict[str, Any] = {}
	if not legacy_row or not period_keys:
		return out
	for key in period_keys:
		if not key:
			continue
		hours = _to_number_or_none(legacy_row.get(key))
		if hours is not None:
			out[f"hours_{key}"] = hours
		actual = _to_number_or_none(legacy_row.get(f"{key}_actual"))
		if actual is not None:
			out[f"fact_hours_{key}"] = actual
	return out


def copy_row_meta(legacy_row: dict) -> dict:
	if not legacy_row:
		return {}
	meta: dict[str, Any] = {}
	email = legacy_row.get("_email") or legacy_row.get("email")
	if email:
		meta["email"] = email
	if legacy_row.get("user_data"):
		meta["user_data"] = legacy_row["user_data"]
	if legacy_row.get("_absences"):
		meta["absences"] = legacy_row["_absences"]
	elif legacy_row.get("absences"):
		meta["absences"] = legacy_row["absences"]
	if legacy_row.get("_workingHours"):
		meta["workingHours"] = legacy_row["_workingHours"]
	elif legacy_row.get("workingHours"):
		meta["workingHours"] = legacy_row["workingHours"]
	if legacy_row.get("_userHolidays"):
		meta["userHolidays"] = legacy_row["_userHolidays"]
	if legacy_row.get("_projectHolidays"):
		meta["projectHolidays"] = legacy_row["_projectHolidays"]
	if legacy_row.get("workload_total") is not None:
		meta["workload_total"] = legacy_row["workload_total"]
	if legacy_row.get("actual_total") is not None:
		meta["actual_total"] = legacy_row["actual_total"]
	if legacy_row.get("expandable") is not None:
		meta["expandable"] = bool(legacy_row["expandable"])
	if legacy_row.get("workload_limit") is not None:
		meta["workload_limit"] = legacy_row["workload_limit"]
	return meta


def _user_label(legacy_row: dict) -> str:
	ud = legacy_row.get("user_data") or {}
	return ud.get("full_name") or legacy_row.get("_email") or legacy_row.get("participant") or ""


def _project_label(legacy_row: dict) -> str:
	return (
		legacy_row.get("project")
		or legacy_row.get("project_name")
		or legacy_row.get("_project")
		or legacy_row.get("participant")
		or ""
	)


def _adapt_user_row(legacy_row: dict, periods: list[dict]) -> dict:
	email = legacy_row.get("_email") or legacy_row.get("email") or legacy_row.get("participant") or ""
	period_keys = [p["key"] for p in periods]
	row = {
		"id": row_id_for_user(email),
		"kind": "user",
		"label": _user_label(legacy_row),
		"hasChildren": bool(legacy_row.get("expandable")),
		"children": [],
		**copy_row_meta(legacy_row),
		**copy_period_scalars(legacy_row, period_keys),
	}
	row["email"] = email
	return row


def _adapt_project_row(legacy_row: dict, periods: list[dict], parent_user_email: str = "") -> dict:
	email = (
		parent_user_email
		or legacy_row.get("_email")
		or legacy_row.get("email")
		or legacy_row.get("participant")
		or ""
	)
	project_name = (
		legacy_row.get("_project") or legacy_row.get("project_name") or legacy_row.get("project") or ""
	)
	period_keys = [p["key"] for p in periods]
	row = {
		"id": row_id_for_project(project_name, email),
		"kind": "project",
		"label": _project_label(legacy_row),
		"hasChildren": False,
		"children": [],
		"project": project_name,
		"project_name": legacy_row.get("project_name") or project_name,
		**copy_row_meta(legacy_row),
		**copy_period_scalars(legacy_row, period_keys),
	}
	row["email"] = email
	row.pop("userHolidays", None)
	return row


def _adapt_placeholder_row(legacy_row: dict) -> dict:
	email = legacy_row.get("_email") or legacy_row.get("email") or ""
	return {
		"id": f"placeholder:{email}",
		"kind": "placeholder",
		"label": legacy_row.get("participant") or "",
		"hasChildren": False,
		"children": [],
		"email": email,
	}


def _team_meta(msg: dict) -> dict:
	meta: dict[str, Any] = {
		"mode": msg.get("mode"),
		"limit": msg.get("limit"),
		"offset": msg.get("offset"),
		"next_offset": msg.get("next_offset"),
		"has_more": bool(msg.get("has_more")),
		"total_users": msg.get("total_users") or 0,
		"users_count": msg.get("users_count") or 0,
		"projects_count": msg.get("projects_count") or 0,
		"assignments_count": msg.get("assignments_count") or 0,
	}
	if msg.get("performance") is not None:
		meta["performance"] = msg["performance"]
	if msg.get("error"):
		meta["error"] = msg["error"]
	return meta


def reshape_team_grid(message: Any) -> dict:
	"""user_totals / full → GridResponse with user roots (lazy children)."""
	msg = message if isinstance(message, dict) else {}
	periods = adapt_periods(msg.get("periods"))
	tree = msg.get("tree_data") if isinstance(msg.get("tree_data"), list) else []
	rows: list[dict] = []
	for legacy in tree:
		if not legacy:
			continue
		if legacy.get("_isUser"):
			rows.append(_adapt_user_row(legacy, periods))
	return {"periods": periods, "rows": rows, "meta": _team_meta(msg)}


def reshape_user_projects(message: Any, parent_user_email: str = "") -> dict:
	"""user_projects mode → GridResponse; rows = project/placeholder children."""
	msg = message if isinstance(message, dict) else {}
	periods = adapt_periods(msg.get("periods"))
	tree = msg.get("tree_data") if isinstance(msg.get("tree_data"), list) else []
	email = parent_user_email or ""
	rows: list[dict] = []
	for legacy in tree:
		if not legacy:
			continue
		if legacy.get("_isLazyPlaceholder"):
			rows.append(_adapt_placeholder_row(legacy))
			continue
		if legacy.get("_isProject") or legacy.get("_project") or legacy.get("project_name"):
			rows.append(_adapt_project_row(legacy, periods, email or legacy.get("_email") or ""))
	return {"periods": periods, "rows": rows, "meta": _team_meta(msg)}


def _adapt_project_flat_row(legacy_row: dict, periods: list[dict]) -> dict:
	email = (
		legacy_row.get("email")
		or legacy_row.get("_email")
		or ((legacy_row.get("user_data") or {}).get("email"))
		or ""
	)
	period_keys = [p["key"] for p in periods]
	scalars = copy_period_scalars(legacy_row, period_keys)
	meta = copy_row_meta(legacy_row)

	level = legacy_row.get("level")
	is_user = legacy_row.get("isUser") or level == "user"
	is_role = legacy_row.get("isRole") or level == "role"
	is_task = legacy_row.get("isTask") or level == "task"

	if is_user:
		ud = legacy_row.get("user_data") or {}
		return {
			"id": row_id_for_user(email),
			"kind": "user",
			"label": ud.get("full_name") or email or legacy_row.get("participant") or "",
			"hasChildren": False,
			"children": [],
			"email": email,
			**meta,
			**scalars,
		}

	if is_role:
		role = legacy_row.get("roleName") or legacy_row.get("role") or ""
		return {
			"id": row_id_for_role(email, role),
			"kind": "role",
			"label": role,
			"hasChildren": False,
			"children": [],
			"email": email,
			"role": role,
			**meta,
			**scalars,
		}

	if is_task:
		role = legacy_row.get("roleName") or legacy_row.get("role") or ""
		task_id = legacy_row.get("task_id") or ""
		task_row = {
			"id": row_id_for_task(email, role, task_id),
			"kind": "task",
			"label": legacy_row.get("task_subject") or task_id or "",
			"hasChildren": False,
			"children": [],
			"email": email,
			"role": role,
			"task_id": task_id,
			**meta,
			**scalars,
		}
		for field in ("task_subject", "exp_start_date", "exp_end_date"):
			if legacy_row.get(field):
				task_row[field] = legacy_row[field]
		return task_row

	return {
		"id": f"row:{legacy_row.get('participant') or ''}",
		"kind": "user",
		"label": str(legacy_row.get("participant") or ""),
		"hasChildren": False,
		"children": [],
		**meta,
		**scalars,
	}


def nest_by_indent(tree_data: list, periods: list[dict]) -> list[dict]:
	roots: list[dict] = []
	stack: list[dict] = []

	for legacy in tree_data:
		if not legacy:
			continue
		indent = legacy.get("indent") if isinstance(legacy.get("indent"), int) else 0
		row = _adapt_project_flat_row(legacy, periods)
		row["children"] = []
		row["hasChildren"] = bool(legacy.get("expandable"))

		while stack and stack[-1]["indent"] >= indent:
			stack.pop()

		if not row.get("email") and stack and stack[-1]["row"].get("email"):
			row["email"] = stack[-1]["row"]["email"]

		if not stack:
			roots.append(row)
		else:
			parent = stack[-1]["row"]
			parent["children"].append(row)
			parent["hasChildren"] = True
		stack.append({"row": row, "indent": indent})

	return roots


def _holiday_date_key(value: Any) -> str:
	raw = value.get("date") if isinstance(value, dict) else value
	if raw is None:
		return ""
	return str(raw)[:10]


def _normalize_holiday_entries(entries: Any) -> list[dict]:
	out: list[dict] = []
	for entry in entries or []:
		date_key = _holiday_date_key(entry)
		if not date_key:
			continue
		item: dict[str, Any] = {"date": date_key}
		if isinstance(entry, dict) and "weekly_off" in entry:
			item["weekly_off"] = bool(entry.get("weekly_off"))
		out.append(item)
	return out


def _stamp_project_tree_holidays(rows: list[dict], message: dict) -> None:
	"""Attach message-level holiday lists onto nested project-tree rows."""
	meta = message.get("metadata") if isinstance(message.get("metadata"), dict) else {}
	user_map = meta.get("user_holidays") if isinstance(meta.get("user_holidays"), dict) else {}
	project_hl = _normalize_holiday_entries(meta.get("project_holidays"))

	def walk(row: dict) -> None:
		email = row.get("email") or ""
		user_hl = _normalize_holiday_entries(user_map.get(email) or [])
		if row.get("kind") == "user":
			# User row uses only userHolidays in the table; fall back to project calendar.
			if user_hl:
				row["userHolidays"] = user_hl
			elif project_hl:
				row["userHolidays"] = project_hl
		else:
			if user_hl:
				row["userHolidays"] = user_hl
			if project_hl:
				row["projectHolidays"] = project_hl
		for child in row.get("children") or []:
			walk(child)

	for row in rows:
		walk(row)


def _stamp_project_tree_capacity(rows: list[dict], message: dict) -> None:
	"""Attach daily hours + absences so project-tab % uses the real fund."""
	meta = message.get("metadata") if isinstance(message.get("metadata"), dict) else {}
	hours_map = meta.get("user_daily_hours") if isinstance(meta.get("user_daily_hours"), dict) else {}
	absences_map = meta.get("user_absences") if isinstance(meta.get("user_absences"), dict) else {}

	def walk(row: dict) -> None:
		email = row.get("email") or ""
		hours = hours_map.get(email)
		if hours:
			row["workingHours"] = hours
		absences = absences_map.get(email)
		if absences:
			row["absences"] = absences
		for child in row.get("children") or []:
			walk(child)

	for row in rows:
		walk(row)


def _project_meta(msg: dict) -> dict:
	meta: dict[str, Any] = {
		"users_count": msg.get("users_count") or 0,
		"tasks_count": msg.get("tasks_count") or 0,
		"assignments_count": msg.get("assignments_count") or 0,
	}
	if msg.get("metadata") is not None:
		meta["metadata"] = msg["metadata"]
	if msg.get("performance") is not None:
		meta["performance"] = msg["performance"]
	if msg.get("error"):
		meta["error"] = msg["error"]
	return meta


def reshape_project_tree(message: Any) -> dict:
	msg = message if isinstance(message, dict) else {}
	periods = adapt_periods(msg.get("periods"))
	tree = msg.get("tree_data") if isinstance(msg.get("tree_data"), list) else []
	rows = nest_by_indent(tree, periods)
	_stamp_project_tree_holidays(rows, msg)
	_stamp_project_tree_capacity(rows, msg)
	return {"periods": periods, "rows": rows, "meta": _project_meta(msg)}


def run_team_workload_grid_canonical(form_input: Any) -> dict:
	"""Call legacy team calc, return canonical GridResponse."""
	legacy = run_get_projects_workload_data_v2(form_input)
	mode = None
	if isinstance(form_input, dict):
		mode = form_input.get("mode")
	elif hasattr(form_input, "get"):
		mode = form_input.get("mode")
	if not mode and isinstance(legacy, dict):
		mode = legacy.get("mode")

	if mode == "user_projects":
		detail_user = ""
		if isinstance(form_input, dict):
			detail_user = form_input.get("detail_user") or ""
		elif hasattr(form_input, "get"):
			detail_user = form_input.get("detail_user") or ""
		return reshape_user_projects(legacy, detail_user)

	return reshape_team_grid(legacy)


def run_project_workload_tree_canonical(form_input: Any) -> dict:
	"""Call legacy project calc, return canonical GridResponse."""
	legacy = run_get_project_workload_data(form_input)
	return reshape_project_tree(legacy)
