# Copyright (c) 2026, Dinext
"""Общая выборка назначений Project Workload (ISS-2026-00865 этап II)."""

from typing import Any, TypedDict
from datetime import date

import frappe
from frappe.query_builder.functions import Count
from frappe.utils import getdate


# ==================== TypedDict определения ====================

class AssignmentRow(TypedDict):
	"""Строка назначения из fetch_pwr_report_assignments."""
	name: str
	task: str
	role: str | None
	user: str
	date_from: date | str
	date_to: date | str
	workload: str | None
	wl_value: float | None
	acc_separately: bool | None
	project_name: str


class ProjectAssignmentRow(TypedDict):
	"""Строка назначения из fetch_project_assignments_with_worker_context."""
	task_id: str
	task_subject: str | None
	assignment_name: str
	role: str | None
	user: str
	date_from: date | str
	date_to: date | str
	workload: str | None
	wl_value: float | None
	acc_separately: bool | None
	full_name: str | None
	user_image: str | None
	email: str
	wholiday_list: str | None
	wtimesheet_template: str | None
	hours_on_date: float | None
	tt_working_hours_on_date: str | None


class UserTotalsBundle(TypedDict):
	"""Результат fetch_pwr_user_totals_bundle."""
	total_users: int
	page_users: list[str]
	assignments: list[AssignmentRow]


def _as_date(value: str | date | None) -> date | None:
	if value is None:
		return None
	return getdate(value)


def build_pwr_assignment_base_query(
	window_start: str | date,
	window_end: str | date,
	*,
	user: str | None = None,
	project: str | None = None,
	project_portfolio: str | None = None,
	user_group_parent: str | None = None,
	use_sql_user_group_join: bool = False,
) -> tuple[Any, Any, Any]:
	"""Базовый qb: PWA + Task, пересечение интервала назначения с [window_start, window_end]."""
	window_start = _as_date(window_start)
	window_end = _as_date(window_end)

	PWA = frappe.qb.DocType("Project Workload Assignment")
	Task = frappe.qb.DocType("Task")

	q = frappe.qb.from_(PWA).left_join(Task).on(PWA.task == Task.name)

	if user_group_parent and use_sql_user_group_join:
		UGM = frappe.qb.DocType("User Group Member")
		q = q.inner_join(UGM).on((UGM.parent == user_group_parent) & (UGM.user == PWA.user))

	if project_portfolio:
		Project = frappe.qb.DocType("Project")
		q = q.inner_join(Project).on(Task.project == Project.name)
		q = q.where(Project.custom_project_portfolio == project_portfolio)

	q = (
		q.where(PWA.user.isnotnull())
		.where(PWA.task.isnotnull())
		.where(Task.project.isnotnull())
		.where(PWA.date_from.isnotnull())
		.where(PWA.date_to >= window_start)
		.where(PWA.date_from <= window_end)
	)

	if user:
		q = q.where(PWA.user == user)
	if project:
		q = q.where(Task.project == project)

	return q, PWA, Task


def fetch_pwr_report_assignments(
	window_start: str | date,
	window_end: str | date,
	*,
	user: str | None = None,
	project: str | None = None,
	project_portfolio: str | None = None,
	user_group_parent: str | None = None,
	use_sql_user_group_join: bool = False,
	restrict_users: list[str] | None = None,
) -> list[AssignmentRow]:
	"""Строки как в Get Projects Workload Data_Exp_V2 (поля PWA + project_name)."""
	q, PWA, Task = build_pwr_assignment_base_query(
		window_start,
		window_end,
		user=user,
		project=project,
		project_portfolio=project_portfolio,
		user_group_parent=user_group_parent,
		use_sql_user_group_join=use_sql_user_group_join,
	)

	q = q.select(
		PWA.name,
		PWA.task,
		PWA.role,
		PWA.user,
		PWA.date_from,
		PWA.date_to,
		PWA.workload,
		PWA.wl_value,
		PWA.acc_separately,
		Task.project.as_("project_name"),
	)

	if restrict_users:
		q = q.where(PWA.user.isin(list(restrict_users)))

	return q.run(as_dict=True)


def count_pwr_report_distinct_users(
	window_start: str | date,
	window_end: str | date,
	*,
	user: str | None = None,
	project: str | None = None,
	project_portfolio: str | None = None,
	user_group_parent: str | None = None,
	use_sql_user_group_join: bool = False,
) -> int:
	q, PWA, Task = build_pwr_assignment_base_query(
		window_start,
		window_end,
		user=user,
		project=project,
		project_portfolio=project_portfolio,
		user_group_parent=user_group_parent,
		use_sql_user_group_join=use_sql_user_group_join,
	)
	rows = q.select(Count(PWA.user).distinct().as_("total_users")).run(as_dict=True)
	if not rows:
		return 0
	return int(rows[0].get("total_users") or 0)


def fetch_pwr_report_user_page(
	window_start: str | date,
	window_end: str | date,
	*,
	limit: int,
	offset: int,
	user: str | None = None,
	project: str | None = None,
	project_portfolio: str | None = None,
	user_group_parent: str | None = None,
	use_sql_user_group_join: bool = False,
) -> list[str]:
	q, PWA, Task = build_pwr_assignment_base_query(
		window_start,
		window_end,
		user=user,
		project=project,
		project_portfolio=project_portfolio,
		user_group_parent=user_group_parent,
		use_sql_user_group_join=use_sql_user_group_join,
	)
	rows = (
		q.select(PWA.user.as_("user"))
		.distinct()
		.orderby(PWA.user)
		.limit(int(limit))
		.offset(int(offset))
		.run(as_dict=True)
	)
	out: list[str] = []
	for r in rows:
		u = r.get("user")
		if u:
			out.append(u)
	return out


def fetch_pwr_user_totals_bundle(
	window_start: str | date,
	window_end: str | date,
	limit: int | str | None,
	offset: int | str | None,
	*,
	user: str | None = None,
	project: str | None = None,
	project_portfolio: str | None = None,
	user_group_parent: str | None = None,
	use_sql_user_group_join: bool = False,
) -> UserTotalsBundle:
	"""Режим user_totals отчёта команды: count, страница пользователей, назначения только по странице."""
	lim = int(limit or 0) or 20
	off = int(offset or 0)
	total_users = count_pwr_report_distinct_users(
		window_start,
		window_end,
		user=user,
		project=project,
		project_portfolio=project_portfolio,
		user_group_parent=user_group_parent,
		use_sql_user_group_join=use_sql_user_group_join,
	)
	page_users = fetch_pwr_report_user_page(
		window_start,
		window_end,
		limit=lim,
		offset=off,
		user=user,
		project=project,
		project_portfolio=project_portfolio,
		user_group_parent=user_group_parent,
		use_sql_user_group_join=use_sql_user_group_join,
	)
	if not page_users:
		return {"total_users": total_users, "page_users": [], "assignments": []}
	assignments = fetch_pwr_report_assignments(
		window_start,
		window_end,
		user=user,
		project=project,
		project_portfolio=project_portfolio,
		user_group_parent=user_group_parent,
		use_sql_user_group_join=use_sql_user_group_join,
		restrict_users=page_users,
	)
	return {"total_users": total_users, "page_users": page_users, "assignments": assignments}


def fetch_project_assignments_with_worker_context(
	project: str,
	date_from: str | date,
	date_to: str | date,
) -> list[ProjectAssignmentRow]:
	"""Строки как в Get_Project_Workload_Data_V3 (Task + PWA + User + Worker + Timesheet Template)."""
	date_from = _as_date(date_from)
	date_to = _as_date(date_to)

	Task = frappe.qb.DocType("Task")
	PWA = frappe.qb.DocType("Project Workload Assignment")
	User = frappe.qb.DocType("User")
	Worker = frappe.qb.DocType("Worker")
	TimesheetTemplate = frappe.qb.DocType("Timesheet Template")

	q = (
		frappe.qb.from_(Task)
		.inner_join(PWA)
		.on(PWA.task == Task.name)
		.inner_join(User)
		.on((User.name == PWA.user) & (User.enabled == 1))
		.left_join(Worker)
		.on(Worker.wuser == PWA.user)
		.left_join(TimesheetTemplate)
		.on(TimesheetTemplate.name == Worker.wtimesheet_template)
		.select(
			Task.name.as_("task_id"),
			Task.subject.as_("task_subject"),
			PWA.name.as_("assignment_name"),
			PWA.role,
			PWA.user,
			PWA.date_from,
			PWA.date_to,
			PWA.workload,
			PWA.wl_value,
			PWA.acc_separately,
			User.full_name,
			User.user_image,
			User.email,
			Worker.wholiday_list,
			Worker.wtimesheet_template,
			TimesheetTemplate.hours_on_date,
			TimesheetTemplate.tt_working_hours_on_date,
		)
		.where(Task.project == project)
		.where(PWA.date_from.isnotnull())
		.where(PWA.date_to.isnotnull())
		.where(PWA.date_to >= date_from)
		.where(PWA.date_from <= date_to)
		.orderby(PWA.user, PWA.role, PWA.date_from)
	)

	return q.run(as_dict=True)
