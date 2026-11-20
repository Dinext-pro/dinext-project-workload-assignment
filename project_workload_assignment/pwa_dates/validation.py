"""Assignment membership and the workload warnings used by both editors."""

from __future__ import annotations

from collections import defaultdict
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import date, timedelta
from html import escape

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate

from project_workload_assignment.project_workload_assignment.project_workload.core import context_loaders
from project_workload_assignment.project_workload_assignment.project_workload.core.assignments import (
	fetch_flat_report_assignments,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.team_capacity import (
	load_team_capacity_rows,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.team_limits import (
	date_in_team_row,
	resolve_person_limits,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.types import (
	WORKLOAD_PERCENT_TASK,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.workload_base import (
	WORKLOAD_BASE_PLAN,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.workload_engine import (
	WorkloadContext,
)

_FIELDS = ("task", "user", "role", "task_dates", "date_from", "date_to", "workload", "wl_value")
_pending = ContextVar("pwa_pending_warnings", default=None)
_parent_sync = ContextVar("pwa_parent_sync", default=None)


def save_parent_dates(doc):
	"""Propagate even an explicitly cleared date from the Task or Issue."""
	token = _parent_sync.set(doc)
	try:
		doc.save(ignore_permissions=True)
	finally:
		_parent_sync.reset(token)


def _values(doc):
	row = {field: doc.get(field) for field in _FIELDS}
	row["task_dates"] = cint(row["task_dates"])
	row["wl_value"] = flt(row["wl_value"])
	for field in ("date_from", "date_to"):
		row[field] = getdate(row[field]) if row[field] else None
	return row


def _task(name):
	return (
		frappe.db.get_value("Task", name, ["project", "exp_start_date", "exp_end_date"], as_dict=True) or {}
	)


def _covers(rows, start, end):
	"""Adjacent team terms cover the entire assignment, including non-working days."""
	if not start and not end:
		return bool(rows)
	start, end = start or end, end or start
	cursor = start
	for row in sorted(
		rows, key=lambda r: getdate(r["pt_valid_from"]) if r.get("pt_valid_from") else date.min
	):
		if not date_in_team_row(row, cursor):
			continue
		last = getdate(row["pt_valid_for"]) if row.get("pt_valid_for") else end
		if last >= end:
			return True
		cursor = last + timedelta(days=1)
	return False


def validate_assignment(doc):
	row = _values(doc)
	previous = doc.get_doc_before_save()
	if previous:
		old = _values(previous)
		changed = {field for field in _FIELDS if row[field] != old[field]}
		if not changed:
			return
		# Task and Issue hooks may reschedule historical assignments after the
		# project team has changed. Only dates on this exact document are inherited.
		if _parent_sync.get() is doc and row["task_dates"] and changed <= {"date_from", "date_to"}:
			return
	task = _task(row["task"])
	project = task.get("project")
	if not project:
		frappe.throw(_("Select a task with a project before assigning a project role."))
	row.update(name=doc.get("name"), project=project)
	if row["task_dates"]:
		for field, parent_field in (("date_from", "exp_start_date"), ("date_to", "exp_end_date")):
			if not row[field] and task.get(parent_field):
				row[field] = getdate(task[parent_field])
				doc.set(field, row[field])
	elif not (row["date_from"] and row["date_to"]):
		frappe.throw(_("Enter the start and end dates of the assignment."))
	start, end = row["date_from"], row["date_to"]
	if start and end and start > end:
		frappe.throw(_("The assignment end date must be on or after its start date."))

	team = [
		item
		for item in load_team_capacity_rows(project, start, end)
		if not item.get("virtual_worker") and item.get("pt_participant") == row["user"]
	]
	matching = [item for item in team if item.get("pt_role") == row["role"]]
	if not _covers(matching, start, end):
		frappe.throw(
			_("The project team must include {0} in role {1} for the full assignment period.").format(
				escape(str(row["user"] or "")), escape(str(row["role"] or ""))
			)
		)
	pending = _pending.get()
	if pending is not None:
		pending[row["name"]] = (row, team)
	else:
		_warn_for_assignments([(row, team)])


@contextmanager
def collect_warnings():
	"""Evaluate the final set once, after replacements and removals in the dialog."""
	pending = {}
	token = _pending.set(pending)
	try:
		yield pending
		_warn_for_assignments(pending.values())
	finally:
		_pending.reset(token)


def _calendar(rows, user):
	users = context_loaders.load_users_with_worker_context([user], permitted_workers_only=False)
	projects = context_loaders.load_projects(sorted({row["project"] for row in rows}))
	holidays, days = context_loaders.load_holiday_data(users, projects)
	starts = [row["date_from"] for row in rows if row["date_from"]]
	return WorkloadContext(
		users,
		projects,
		context_loaders.load_working_hours_overrides(users, projects),
		days,
		context_loaders.load_user_absences([user], min_end_date=min(map(getdate, starts))) if starts else {},
		context_loaders.load_monthly_plan_cache(rows),
		holidays,
	)


def _warn_for_assignments(changes):
	by_person = defaultdict(list)
	for row, team in changes:
		by_person[row["user"]].append((row, team))
	for user, edits in by_person.items():
		changed = {row["name"]: row for row, team in edits}
		dated = [row for row in changed.values() if row["date_from"] and row["date_to"]]
		neighbours = []
		if dated:
			neighbours = fetch_flat_report_assignments(
				min(r["date_from"] for r in dated), max(r["date_to"] for r in dated), user=user
			)
		rows = [r for r in neighbours if r["name"] not in changed] + list(changed.values())
		calendar = _calendar(rows, user)
		# The project may use forecasts for daily loads, while the editor's
		# missing-plan hint explicitly checks pwea_plan.
		percent_tasks = [row for row, team in edits if row["workload"] == WORKLOAD_PERCENT_TASK]
		plan_hours = (
			context_loaders.load_monthly_plan_cache(percent_tasks, hours_source=WORKLOAD_BASE_PLAN)
			if percent_tasks
			else {}
		)
		planned = {key.rsplit("_", 2)[0] for key in plan_hours}
		by_role, by_project, changed_days = _daily_hours(rows, calendar, changed)
		messages = set()
		for row, team in edits:
			role = row["role"]
			if row["workload"] == WORKLOAD_PERCENT_TASK and f"{row['task']}_{role}" not in planned:
				messages.add(_("Work efforts are not defined for role: {0}").format(escape(str(role))))
			if not (row["date_from"] and row["date_to"]) or user not in calendar.users_data:
				continue
			day = _first_overloaded_day(row, team, by_role[(row["project"], role)], calendar)
			if day:
				messages.add(
					_("Assignments for {0} in role {1} exceed the available hours on {2}.").format(
						escape(str(user)), escape(str(role)), day
					)
				)
		if user in calendar.users_data:
			for day in sorted(changed_days):
				projects = by_project[day]
				if sum(hours > 0 for hours in projects.values()) < 2:
					continue
				# The team report uses an empty project to obtain the employee's
				# own calendar once, independently of each assignment's calendar.
				if sum(projects.values()) > calendar.get_available_hours(day, user, "") + 0.000001:
					messages.add(
						_("Assignments across projects exceed the available hours for {0} on {1}.").format(
							escape(str(user)), day
						)
					)
					break
		for message in sorted(messages):
			frappe.msgprint(message, alert=True, indicator="orange")


def _daily_hours(rows, calendar, changed):
	by_role = defaultdict(lambda: defaultdict(float))
	by_project = defaultdict(lambda: defaultdict(float))
	changed_days = set()
	for row in rows:
		if not row["date_from"] or not row["date_to"]:
			continue
		for day, hours in calendar.compute_assignment_daily_hours(row).items():
			by_role[(row["project"], row["role"])][day] += hours
			by_project[day][row["project"]] += hours
			if row["name"] in changed and hours > 0:
				changed_days.add(day)
	return by_role, by_project, changed_days


def _first_overloaded_day(row, team, totals, calendar):
	user, role, project = row["user"], row["role"], row["project"]
	for day, hours in sorted(totals.items()):
		if not row["date_from"] <= getdate(day) <= row["date_to"]:
			continue
		active = [item for item in team if date_in_team_row(item, day)]
		limits = [
			limit
			for item, limit in zip(active, resolve_person_limits(active), strict=True)
			if item["pt_role"] == role
		]
		if not limits:
			continue
		capacity = calendar.get_available_hours(day, user, project) * min(limits) / 100
		if hours > capacity + 0.000001:
			return day
	return None
