# Copyright (c) 2026, Dinext
"""User Timesheet plan/fact limits — SS Calculate Timesheet Limits_V4 rules.

No year/month, walk up, first PWE, sum all pwea_plan.
WE per-month cells stay on ``timesheet_limits.py``.

API method: calculate_user_timesheet_limits
"""

from __future__ import annotations

import json

import frappe

from project_workload_assignment.project_workload_assignment.work_efforts.models import (
	TimesheetLimitsFormInput,
	TimesheetLimitsResponse,
)


def _as_json_list(value):
	"""frappe.call may pass list or JSON string."""
	if value is None or value == "":
		return []
	if isinstance(value, str):
		return json.loads(value)
	if isinstance(value, list):
		return value
	return list(value)


def run_calculate_user_timesheet_limits(
	form_dict: TimesheetLimitsFormInput,
) -> TimesheetLimitsResponse:
	# Caches for this request (same keys as SS V4)
	cache = {
		"has_children": {},
		"all_children": {},
		"plan_data": {},
		"limits": {},
		"total_hours": {},
		"roles": {},
		"project_settings": {},
		"task_linked_issues": {},
		"root_task_with_issue": {},
	}

	def has_children(project, task):
		if not task:
			return False
		if (project + task) in cache["has_children"]:
			return cache["has_children"][project + task]
		children = frappe.db.get_all(
			"Task", filters={"parent_task": task, "project": project}, limit=1
		)
		cache["has_children"][project + task] = bool(children)
		return cache["has_children"][project + task]

	def get_all_children(project, task):
		if (project + task) in cache["all_children"]:
			return cache["all_children"][project + task]
		result = []
		direct = frappe.db.get_all(
			"Task",
			filters={"parent_task": task, "project": project},
			fields=["name"],
		)
		for row in direct:
			result.append(row.name)
			result = result + get_all_children(project, row.name)
		cache["all_children"][project + task] = result
		return result

	def has_linked_issue(task_name):
		if task_name not in cache["task_linked_issues"]:
			linked_issue = frappe.db.get_value("Task", task_name, "custom_linked_issue")
			cache["task_linked_issues"][task_name] = bool(linked_issue)
		return cache["task_linked_issues"][task_name]

	def find_root_task_with_linked_issue(project, task):
		cache_key = project + task
		if cache_key in cache["root_task_with_issue"]:
			return cache["root_task_with_issue"][cache_key]

		current_task = task
		while current_task:
			if has_linked_issue(current_task):
				cache["root_task_with_issue"][cache_key] = current_task
				return current_task
			current_task = frappe.db.get_value("Task", current_task, "parent_task")

		cache["root_task_with_issue"][cache_key] = None
		return None

	def find_task_with_plan(project, task, role):
		requirement = cache["project_settings"].get(project, "Опционально")
		root_task_with_issue = None
		can_go_above_root_issue = False

		if requirement == "Обязательно для всех Запросов":
			root_task_with_issue = find_root_task_with_linked_issue(project, task)
			if not root_task_with_issue:
				can_go_above_root_issue = True

		while task:
			if (project + task + role) in cache["plan_data"]:
				return cache["plan_data"][project + task + role]

			pwe = frappe.db.get_all(
				"Project Work Efforts",
				filters={
					"pwe_task": task,
					"pwe_project": project,
					"pwe_project_role": role,
				},
				fields=["name"],
			)
			if pwe:
				doc = frappe.get_doc("Project Work Efforts", pwe[0].name)
				planned = sum(
					(frappe.utils.flt(r.pwea_plan or 0) for r in doc.pwe_amount), 0.0
				)

				if planned > 0:
					subj = frappe.db.get_value("Task", task, "subject") or task
					cache["plan_data"][project + task + role] = {
						"task_name": task,
						"planned_hours": planned,
						"subject": subj,
					}
					return cache["plan_data"][project + task + role]

			if (
				requirement == "Обязательно для всех Запросов"
				and root_task_with_issue
				and task == root_task_with_issue
				and not can_go_above_root_issue
			):
				break

			task = frappe.db.get_value("Task", task, "parent_task")

		return None

	def get_project_limits(project):
		if project in cache["limits"]:
			return cache["limits"][project]

		rows = frappe.db.get_all(
			"Limit Control",
			filters={"parent": project, "parenttype": "Project"},
			fields=["type", "limit"],
		)

		def parse(typ):
			for r in rows:
				if r.type.strip().lower() == typ:
					if isinstance(r.limit, (int, float)):
						return float(r.limit)
					if r.limit and str(r.limit).replace(".", "", 1).isdigit():
						return float(r.limit)
			return None

		limits = {
			"block": parse("блокировка"),
			"warning": parse("предупреждение") or 100,
			"message": parse("уведомление"),
		}

		cache["limits"][project] = limits
		return limits

	def aggregate_hours(
		plan_task, tasks, role, timesheet_name, timesheet_status, local_positions
	):
		if (plan_task + role) in cache["total_hours"]:
			return cache["total_hours"][plan_task + role]

		timesheet_owner_name = None
		if timesheet_name:
			timesheet_owner_email = frappe.db.get_value(
				"User Timesheet", timesheet_name, "timesheet_from"
			)
			if timesheet_owner_email:
				timesheet_owner_name = frappe.db.get_value(
					"User", timesheet_owner_email, "full_name"
				)

		db_rows = frappe.db.get_all(
			"User Timesheet Position",
			filters={
				"document_name": ["in", tasks],
				"project_role": role,
				"user_timesheet": ["!=", timesheet_name],
			},
			fields=["all_hours", "status", "document_name", "custom_username"],
		)

		total = {}
		users = set()
		user_hours = {}
		for r in db_rows:
			hrs = frappe.utils.flt(r.all_hours or 0.0)
			total["total"] = total.get("total", 0.0) + hrs
			total[r.status] = total.get(r.status, 0.0) + hrs
			if r.custom_username:
				users.add(r.custom_username)
				bucket = user_hours.setdefault(r.custom_username, {})
				bucket[r.status] = bucket.get(r.status, 0.0) + hrs

		if timesheet_name and timesheet_status:
			for pos in local_positions:
				task = pos.get("document_name")
				task_role = pos.get("project_role", "")
				local_hours = pos.get("all_hours")
				local_user = timesheet_owner_name
				if local_user:
					users.add(local_user)

				if task in tasks and role == task_role and local_hours:
					hrs = frappe.utils.flt(local_hours)
					total["total"] = total.get("total", 0.0) + hrs
					total[timesheet_status] = total.get(timesheet_status, 0.0) + hrs
					if local_user:
						bucket = user_hours.setdefault(local_user, {})
						bucket[timesheet_status] = bucket.get(timesheet_status, 0.0) + hrs

		total["user_hours"] = user_hours
		total["users"] = users
		cache["total_hours"][plan_task + role] = total
		return total

	def get_project_roles(project):
		if project in cache["roles"]:
			return cache["roles"][project]

		roles = set()
		project_roles = frappe.db.get_all(
			"Project Team Details",
			filters={"parent": project},
			fields=["pt_role"],
		)
		for pr in project_roles:
			roles.add(pr.pt_role)

		cache["roles"][project] = roles
		return roles

	def is_plan_required(position):
		project = position.get("project")
		task_name = position.get("document_name")

		if not project or not task_name:
			return False

		if project not in cache["project_settings"]:
			requirement = frappe.db.get_value(
				"Project", project, "custom_обязательность_плановых_трудозатрат"
			)
			cache["project_settings"][project] = requirement or "Опционально"

		requirement = cache["project_settings"][project]

		if requirement == "Опционально":
			return False
		if requirement == "Обязательно для всех Задач":
			return True
		if requirement == "Обязательно для всех Запросов":
			return find_root_task_with_linked_issue(project, task_name) is not None
		return False

	positions = _as_json_list(form_dict.get("positions"))
	timesheet_name = form_dict.get("timesheet_name")
	results: TimesheetLimitsResponse = []

	for pos in positions or []:
		utp = pos.get("name")
		doc = pos.get("document_name")
		role = pos.get("project_role", "")
		proj = pos.get("project")
		status = pos.get("status")

		if not doc:
			continue

		plan_required = is_plan_required(pos)

		project_roles = []
		if role:
			project_roles.append(role)
		else:
			project_roles = get_project_roles(proj)

		for project_role in project_roles:
			plan = find_task_with_plan(proj, doc, project_role)

			used_parent = False
			task_for_fact = [doc]
			task_for_plan = doc

			if plan:
				if plan["task_name"] != doc:
					used_parent = True
					task_for_plan = plan["task_name"]
				task_for_fact = [plan["task_name"]] + get_all_children(proj, task_for_plan)
			else:
				if has_children(proj, task_for_plan):
					task_for_fact = task_for_fact + get_all_children(proj, task_for_plan)

			total_hours = aggregate_hours(
				task_for_plan,
				task_for_fact,
				project_role,
				timesheet_name,
				status,
				positions,
			)

			planned = plan["planned_hours"] if plan else 0.0
			pct = 0
			if planned > 0:
				pct = int((total_hours.get("total", 0) / planned) * 100)

			limits = get_project_limits(proj or "")
			limit_status = "no-plan"
			limit = 0

			if plan_required and planned == 0:
				limit_status = "block"
			elif planned > 0:
				if limits.get("block") and pct > limits["block"]:
					limit_status = "block"
					limit = limits["block"]
				elif limits.get("warning") and pct > limits["warning"]:
					limit_status = "warning"
					limit = limits["warning"]
				elif limits.get("message") and pct > limits["message"]:
					limit_status = "message"
					limit = limits["message"]
				else:
					limit_status = "normal"

			results.append(
				{
					"project": proj,
					"position": utp,
					"document_name": doc,
					"role": project_role,
					"planned_hours": planned,
					"total_hours": total_hours.get("total", 0),
					"hours_data": total_hours,
					"completion_percentage": pct,
					"status": limit_status,
					"limit": limit,
					"used_parent_for_plan": used_parent,
					"used_children_for_actual": len(task_for_fact) > 1,
					"child_tasks_count": max(len(task_for_fact) - 1, 0),
					"task_subject": frappe.db.get_value("Task", doc, "subject") or doc,
					"plan_required": plan_required,
					"plan_task_subject": (plan or {}).get("subject")
					or frappe.db.get_value("Task", doc, "subject")
					or doc,
					"has_linked_issue": has_linked_issue(doc)
					if cache["project_settings"].get(proj)
					== "Обязательно для всех Запросов"
					else None,
					"root_task_with_issue": find_root_task_with_linked_issue(proj, doc)
					if cache["project_settings"].get(proj)
					== "Обязательно для всех Запросов"
					else None,
				}
			)

	return results
