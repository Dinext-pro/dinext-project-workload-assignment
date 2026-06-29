# -*- coding: utf-8 -*-
"""Seed approved UTP hours for PWR actual testing (past/current/future dates)."""
from __future__ import annotations

import frappe
from frappe.utils import add_days, getdate, nowdate

from project_workload_assignment.project_workload_assignment.project_workload.assignments import (
	fetch_pwr_report_assignments,
)

PREFIX = "PWR actual seed"
APPROVED = "Согласовано"
TARGET_DATES = [
	("2026-06-02", 8.0),
	("2026-06-10", 6.0),
	("2026-06-16", 4.0),
	("2026-06-17", 5.0),
	("2026-07-02", 7.0),
	("2026-07-15", 3.0),
	("2026-08-20", 8.0),
]


def _week_bounds(date_str: str) -> tuple[str, str]:
	d = getdate(date_str)
	start = add_days(d, -d.weekday())
	end = add_days(start, 6)
	return str(start), str(end)


def _find_timesheet(user: str, date_str: str) -> str | None:
	start, end = _week_bounds(date_str)
	rows = frappe.get_all(
		"User Timesheet",
		filters={
			"timesheet_from": user,
			"ts_valid_from": ["<=", date_str],
			"ts_valid_for": [">=", date_str],
		},
		fields=["name"],
		limit=1,
	)
	if rows:
		return rows[0]["name"]
	rows = frappe.get_all(
		"User Timesheet",
		filters={"timesheet_from": user, "ts_valid_from": start, "ts_valid_for": end},
		fields=["name"],
		limit=1,
	)
	return rows[0]["name"] if rows else None


def _ensure_timesheet(user: str, date_str: str, user_group: str | None) -> str:
	existing = _find_timesheet(user, date_str)
	if existing:
		return existing
	start, end = _week_bounds(date_str)
	doc = frappe.get_doc(
		{
			"doctype": "User Timesheet",
			"timesheet_from": user,
			"ts_valid_from": start,
			"ts_valid_for": end,
			"user_group": user_group or "",
		}
	)
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return doc.name


def _worker_user_group(user: str) -> str | None:
	return frappe.db.get_value("Worker", {"wuser": user}, "wuser_group")


def _replace_utp_details(utp_name: str, hours_rows: list[dict]) -> None:
	frappe.db.delete("User Timesheet Position Details", {"parent": utp_name})
	for idx, row in enumerate(hours_rows, start=1):
		frappe.get_doc(
			{
				"doctype": "User Timesheet Position Details",
				"parent": utp_name,
				"parenttype": "User Timesheet Position",
				"parentfield": "table",
				"idx": idx,
				"date": row["date"],
				"hours": row["hours"],
				"description": row.get("description") or "",
			}
		).db_insert()


def _upsert_utp(
	*,
	user: str,
	project: str,
	task: str,
	role: str,
	user_timesheet: str,
	user_group: str | None,
	hours_rows: list[dict],
) -> str:
	filters = {
		"user": user,
		"project": project,
		"document_type": "Task",
		"document_name": task,
		"user_timesheet": user_timesheet,
	}
	existing = frappe.db.get_value("User Timesheet Position", filters, "name")
	total = sum(float(r["hours"]) for r in hours_rows)

	if existing:
		_replace_utp_details(existing, hours_rows)
		frappe.db.set_value(
			"User Timesheet Position",
			existing,
			{
				"status": APPROVED,
				"workflow_state": APPROVED,
				"all_hours": total,
			},
			update_modified=True,
		)
		frappe.db.commit()
		return existing

	doc = frappe.get_doc(
		{
			"doctype": "User Timesheet Position",
			"user_timesheet": user_timesheet,
			"user": user,
			"user_group": user_group or "",
			"project": project,
			"project_role": role,
			"document_type": "Task",
			"document_name": task,
			"status": APPROVED,
			"workflow_state": APPROVED,
			"all_hours": total,
		}
	)
	doc.flags.ignore_links = True
	doc.set_user_and_timestamp()
	doc.db_insert()
	_replace_utp_details(doc.name, hours_rows)
	frappe.db.set_value(
		"User Timesheet Position",
		doc.name,
		{"status": APPROVED, "workflow_state": APPROVED, "all_hours": total},
		update_modified=False,
	)
	frappe.db.commit()
	return doc.name


def run(max_users: int = 8):
	frappe.set_user("Administrator")
	window_start = "2026-03-01"
	window_end = "2026-09-30"
	assignments = fetch_pwr_report_assignments(window_start, window_end)
	if not assignments:
		return {"created": 0, "message": "no assignments"}

	by_user: dict[str, list] = {}
	for row in assignments:
		user = row.get("user")
		if not user:
			continue
		by_user.setdefault(user, []).append(row)

	created = []
	users = sorted(by_user.keys())[:max_users]
	for user in users:
		user_group = _worker_user_group(user)
		rows = by_user[user]
		project_row = rows[0]
		project = project_row.get("project_name")
		task = project_row.get("task")
		role = project_row.get("role")
		if not project or not task or not role:
			continue

		by_timesheet: dict[str, list[dict]] = {}
		for date_str, hours in TARGET_DATES:
			ts_name = _ensure_timesheet(user, date_str, user_group)
			by_timesheet.setdefault(ts_name, []).append(
				{
					"date": date_str,
					"hours": hours,
					"description": f"{PREFIX} {date_str}",
				}
			)

		for ts_name, table in by_timesheet.items():
			utp_name = _upsert_utp(
				user=user,
				project=project,
				task=task,
				role=role,
				user_timesheet=ts_name,
				user_group=user_group,
				hours_rows=table,
			)
			created.append(
				{
					"user": user,
					"project": project,
					"timesheet": ts_name,
					"utp": utp_name,
					"dates": [r["date"] for r in table],
					"hours": sum(float(r["hours"]) for r in table),
				}
			)

	return {
		"today": nowdate(),
		"users_seeded": len(users),
		"utp_records": len(created),
		"sample": created[:5],
	}
