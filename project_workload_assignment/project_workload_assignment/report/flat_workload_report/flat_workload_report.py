# Copyright (c) 2026, Dinext
"""Плоский отчёт: Пользователь | Роль | Проект | Задача | Дата | Часы | FTE."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import add_days, getdate, nowdate

from project_workload_assignment.project_workload_assignment.project_workload.assignments import (
	fetch_flat_report_assignments,
)
from project_workload_assignment.project_workload_assignment.project_workload.context_loaders import (
	load_holiday_data,
	load_monthly_plan_cache,
	load_projects,
	load_tasks,
	load_user_absences,
	load_users_with_worker_context,
	load_working_hours_overrides,
)
from project_workload_assignment.project_workload_assignment.project_workload.types import (
	DEFAULT_HOURS_ON_DATE,
)
from project_workload_assignment.project_workload_assignment.project_workload.workload_engine import (
	WorkloadContext,
)


def execute(filters=None):
	"""Плоский отчет: Пользователь | Роль | Проект | Задача | Дата | Часы | FTE."""
	filters = filters or {}

	columns = [
		{"fieldname": "user_name", "label": _("Пользователь"), "fieldtype": "Data", "width": 200},
		{"fieldname": "role", "label": _("Роль"), "fieldtype": "Data", "width": 150},
		{"fieldname": "project_name", "label": _("Проект"), "fieldtype": "Data", "width": 200},
		{"fieldname": "task", "label": _("Задача"), "fieldtype": "Data", "width": 200},
		{"fieldname": "date", "label": _("Дата"), "fieldtype": "Date", "width": 100},
		{"fieldname": "hours", "label": _("Часы"), "fieldtype": "Float", "precision": 2, "width": 100},
		{"fieldname": "fte", "label": _("FTE"), "fieldtype": "Float", "precision": 4, "width": 80},
	]

	return columns, get_data(filters)


def get_data(filters: dict | None) -> list[dict]:
	from_date = filters.get("from_date") or nowdate()
	to_date = filters.get("to_date") or add_days(nowdate(), 90)
	from_date_obj = getdate(from_date)
	to_date_obj = getdate(to_date)

	assignments = fetch_flat_report_assignments(
		from_date,
		to_date,
		user=filters.get("user"),
		project=filters.get("project"),
		task=filters.get("task"),
		user_group_parent=filters.get("user_group"),
	)
	if not assignments:
		return []

	users_set = list({a["user"] for a in assignments})
	projects_set = list({a["project"] for a in assignments})
	tasks_set = list({a["task"] for a in assignments})

	users_data = load_users_with_worker_context(users_set)
	projects_data = load_projects(projects_set)
	tasks_data = load_tasks(tasks_set)
	working_hours_overrides = load_working_hours_overrides(users_data)
	holiday_lists_cache, holiday_date_sets = load_holiday_data(users_data, projects_data)
	user_absences = load_user_absences(users_set, min_end_date=from_date)
	monthly_plan_cache = load_monthly_plan_cache(assignments)

	wl_ctx = WorkloadContext(
		users_data=users_data,
		projects_data=projects_data,
		working_hours_overrides=working_hours_overrides,
		holiday_date_sets=holiday_date_sets,
		user_absences=user_absences,
		monthly_plan_cache=monthly_plan_cache,
		holiday_lists_cache=holiday_lists_cache,
	)

	result: list[dict] = []
	for assignment in assignments:
		user_email = assignment["user"]
		project_id = assignment["project"]
		task_id = assignment["task"]
		role_name = assignment.get("role") or ""

		user_data = users_data.get(user_email, {})
		project_data = projects_data.get(project_id, {})
		task_data = tasks_data.get(task_id, {})

		user_display_name = user_data.get("full_name") or user_email
		project_display_name = project_data.get("project_name") or project_id
		task_display_name = task_data.get("subject") or assignment.get("task_subject") or task_id

		daily_loads = wl_ctx.compute_assignment_daily_hours(
			assignment,
			clip_from=from_date_obj,
			clip_to=to_date_obj,
		)
		for date_str, daily_hours in daily_loads.items():
			result.append({
				"user_name": user_display_name,
				"role": role_name,
				"project_name": project_display_name,
				"task": task_display_name,
				"date": date_str,
				"hours": round(daily_hours, 2),
				"fte": round(daily_hours / DEFAULT_HOURS_ON_DATE, 4),
			})

	result.sort(key=lambda row: (row["date"], row["user_name"], row["project_name"], row["task"]))
	return result
