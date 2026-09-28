# Copyright (c) 2026, Dinext
"""Факт таймшита по месяцу задачи и роли. Один проход на запрос, без обхода дерева."""

from __future__ import annotations

import frappe

from project_workload_assignment.project_workload_assignment.plan_fact import Entry
from project_workload_assignment.project_workload_assignment.work_efforts.models import (
	TimesheetPositionInput,
)
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.bulk_loader import (
	TimesheetLimitsBulkData,
)
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.parsing import (
	LimitsParsing,
)


def add_fact(
	bulk: TimesheetLimitsBulkData,
	year: int,
	month: int,
	task: str | None,
	role: str | None,
	hours: float,
	status: str | None = "",
	user: str | None = "",
) -> None:
	if not task or hours <= 0:
		return
	key = (int(year), int(month), role or "")
	bucket: dict[tuple[str, str, str], float] = bulk.fact_by_period.setdefault(key, {})
	row = (task, status or "", user or "")
	bucket[row] = bucket.get(row, 0.0) + float(hours)


def used_entries(bulk: TimesheetLimitsBulkData, year: int, month: int) -> tuple[Entry, ...]:
	"""Одна запись на задачу и роль. Дневные строки уже сжаты."""
	totals: dict[tuple[str, str], float] = {}
	for (bucket_year, bucket_month, role), bucket in bulk.fact_by_period.items():
		if bucket_year != year or bucket_month != month:
			continue
		for (task, _status, _user), hours in bucket.items():
			if hours <= 0:
				continue
			slot = (task, role)
			totals[slot] = totals.get(slot, 0.0) + hours
	return tuple(Entry(task, role, hours) for (task, role), hours in totals.items())


def accumulate_fact(
	data: dict,
	bulk: TimesheetLimitsBulkData,
	year: int,
	month: int,
	consumers: frozenset[str] | set[str],
	role: str,
) -> None:
	bucket = bulk.fact_by_period.get((year, month, role))
	if not bucket:
		return
	allowed = set(consumers)
	users: set[str] = data.setdefault("users", set())
	user_hours: dict = data.setdefault("user_hours", {})
	for (task, status, user), hours in bucket.items():
		if task not in allowed or hours <= 0:
			continue
		data["total"] = data.get("total", 0.0) + hours
		data[status] = data.get(status, 0.0) + hours
		if not user:
			continue
		users.add(user)
		by_status = user_hours.setdefault(user, {})
		by_status[status] = by_status.get(status, 0.0) + hours


def year_month(value) -> tuple[int, int] | None:
	if value is None or value == "":
		return None
	if hasattr(value, "year") and hasattr(value, "month"):
		return int(value.year), int(value.month)
	parts = str(value)[:10].split("-")
	if len(parts) < 2:
		return None
	try:
		return int(parts[0]), int(parts[1])
	except ValueError:
		return None


def absorb_positions(bulk: TimesheetLimitsBulkData, positions: list[TimesheetPositionInput]) -> None:
	"""Часы открытого таймшита из формы. Клетка трудозатрат (год и месяц) сюда не входит."""
	for pos in positions or []:
		if _is_period_cell(pos):
			continue
		task = pos.get("document_name")
		role = pos.get("project_role") or ""
		status = pos.get("status") or ""
		user = pos.get("custom_username") or ""
		for detail in pos.get("details") or []:
			parsed = year_month(detail.get("date"))
			if not parsed:
				continue
			add_fact(
				bulk,
				parsed[0],
				parsed[1],
				task,
				role,
				float(detail.get("hours") or 0),
				status,
				user,
			)


def fill(
	bulk: TimesheetLimitsBulkData,
	positions: list[TimesheetPositionInput],
	timesheet_name: str | None,
) -> None:
	"""Чужие таймшиты из базы, текущий — из positions. До нарезки срезов."""
	_from_db(bulk, timesheet_name)
	absorb_positions(bulk, positions)


def _is_period_cell(pos: TimesheetPositionInput) -> bool:
	return (
		LimitsParsing.as_int(pos.get("year")) is not None
		and LimitsParsing.as_int(pos.get("month")) is not None
	)


def _from_db(bulk: TimesheetLimitsBulkData, timesheet_name: str | None) -> None:
	tasks = list(bulk.task_meta)
	if not tasks:
		return
	filters: dict = {"document_name": ["in", tasks]}
	if timesheet_name:
		filters["user_timesheet"] = ["!=", timesheet_name]
	rows = frappe.db.get_all(
		"User Timesheet Position",
		filters=filters,
		fields=["name", "document_name", "project_role", "status", "custom_username"],
	)
	by_name = {row.name: row for row in rows}
	if not by_name:
		return
	details = frappe.db.get_all(
		"User Timesheet Position Details",
		filters={
			"parent": ["in", list(by_name)],
			"parenttype": "User Timesheet Position",
		},
		fields=["parent", "date", "hours"],
	)
	for detail in details:
		parent = by_name.get(detail.parent)
		parsed = year_month(detail.date)
		if parent is None or parsed is None:
			continue
		add_fact(
			bulk,
			parsed[0],
			parsed[1],
			parent.document_name,
			parent.project_role,
			float(detail.hours or 0),
			parent.status,
			parent.custom_username,
		)
