# Copyright (c) 2026, Dinext
"""Загрузка справочников и контекста для расчёта Project Workload."""

from __future__ import annotations

from typing import TYPE_CHECKING
from datetime import date

import frappe
from frappe.utils import getdate

from project_workload_assignment.project_workload_assignment.project_workload.core.types import (
	AbsenceEntry,
	HolidayEntry,
	ProjectUtilizationRow,
	ProjectWorkloadInfo,
	TaskWorkloadInfo,
	UserWorkloadInfo,
)

if TYPE_CHECKING:
	from project_workload_assignment.project_workload_assignment.project_workload.core.assignments import (
		AssignmentRow,
	)


def _debug_loader(event: str, details: dict) -> None:
	"""No-op: verbose context load tracing disabled."""
	return


def get_permitted_worker_users(candidate_users: list[str]) -> set[str]:
	"""Worker.wuser, видимые текущему пользователю (get_list + DocType Permission)."""
	if not candidate_users:
		return set()
	# get_all не применяет permission_query_conditions; get_list — применяет.
	return set(
		frappe.get_list(
			"Worker",
			filters={"wuser": ["in", candidate_users]},
			pluck="wuser",
		)
	)


def filter_assignments_by_permitted_workers(assignments: list[dict]) -> list[dict]:
	"""Оставляет назначения только для Worker, доступных текущему пользователю."""
	if not assignments:
		return []

	candidate_users = list({a.get("user") for a in assignments if a.get("user")})
	permitted_users = get_permitted_worker_users(candidate_users)
	filtered = [a for a in assignments if a.get("user") in permitted_users]
	_debug_loader(
		"filter_assignments_by_permitted_workers",
		{
			"session_user": frappe.session.user,
			"roles": frappe.get_roles(frappe.session.user),
			"assignments_before": len(assignments),
			"assignments_after": len(filtered),
			"candidate_users_count": len(candidate_users),
			"permitted_workers_count": len(permitted_users),
			"permitted_workers_sample": list(permitted_users)[:10],
			"removed_users_count": len(candidate_users) - len(permitted_users),
			"removed_users_sample": [u for u in candidate_users if u not in permitted_users][:10],
		},
	)
	return filtered


def load_users_with_worker_context(users_list: list[str]) -> dict[str, UserWorkloadInfo]:
	"""User (qb) + Worker (frappe.get_all с permissions) + Timesheet Template."""
	users_data: dict[str, UserWorkloadInfo] = {}
	if not users_list:
		return users_data

	User = frappe.qb.DocType("User")
	users_db = (
		frappe.qb.from_(User)
		.select(User.name, User.full_name, User.user_image, User.email)
		.where(User.name.isin(users_list))
		.where(User.enabled == 1)
	).run(as_dict=True)

	workers_db = frappe.get_list(
		"Worker",
		filters={"wuser": ["in", users_list]},
		fields=[
			"wuser",
			"wholiday_list",
			"wtimesheet_template",
			"wtype",
			"wvalid_from",
			"wvalid_for",
		],
	)
	workers_by_user = {w["wuser"]: w for w in workers_db}

	workers_loaded = [w["wuser"] for w in workers_db]
	qb_users_loaded = [u["name"] for u in users_db]
	missing_worker_for_users = [u for u in users_list if u not in workers_by_user]
	missing_qb_user = [u for u in users_list if u not in qb_users_loaded]
	_debug_loader(
		"load_users_with_worker_context",
		{
			"session_user": frappe.session.user,
			"roles": frappe.get_roles(frappe.session.user),
			"requested_users_count": len(users_list),
			"requested_users_sample": users_list[:10],
			"qb_users_count": len(users_db),
			"qb_users_sample": qb_users_loaded[:10],
			"permission_workers_count": len(workers_db),
			"permission_workers_sample": workers_loaded[:10],
			"missing_worker_for_users_count": len(missing_worker_for_users),
			"missing_worker_for_users_sample": missing_worker_for_users[:10],
			"missing_qb_user_count": len(missing_qb_user),
			"missing_qb_user_sample": missing_qb_user[:10],
			"note": (
				"permission_workers — frappe.get_list(Worker) с DocType Permission; "
				"назначения должны быть отфильтрованы через filter_assignments_by_permitted_workers"
			),
		},
	)

	template_names = list({
		w["wtimesheet_template"] for w in workers_db if w.get("wtimesheet_template")
	})
	templates_by_name: dict[str, dict] = {}
	if template_names:
		TS = frappe.qb.DocType("Timesheet Template")
		templates_db = (
			frappe.qb.from_(TS)
			.select(TS.name, TS.hours_on_date, TS.tt_working_hours_on_date)
			.where(TS.name.isin(template_names))
		).run(as_dict=True)
		for template in templates_db:
			templates_by_name[template["name"]] = template

	for user_row in users_db:
		if user_row["name"] not in workers_by_user:
			continue
		worker = workers_by_user[user_row["name"]]
		template = templates_by_name.get(worker.get("wtimesheet_template") or "")
		users_data[user_row["name"]] = UserWorkloadInfo(
			name=user_row["name"],
			full_name=user_row.get("full_name"),
			user_image=user_row.get("user_image"),
			email=user_row.get("email"),
			wholiday_list=worker.get("wholiday_list"),
			wtimesheet_template=worker.get("wtimesheet_template"),
			wtype=worker.get("wtype"),
			wvalid_from=worker.get("wvalid_from"),
			wvalid_for=worker.get("wvalid_for"),
			hours_on_date=template.get("hours_on_date") if template else None,
			tt_working_hours_on_date=template.get("tt_working_hours_on_date") if template else None,
		)

	return users_data


def load_worker_wtypes(users_list: list[str]) -> dict[str, str]:
	"""Worker.wtype (Employee/Supplier) по email пользователя."""
	if not users_list:
		return {}
	rows = frappe.get_list(
		"Worker",
		filters={"wuser": ["in", users_list]},
		fields=["wuser", "wtype"],
	)
	return {row["wuser"]: row.get("wtype") or "" for row in rows if row.get("wuser")}


def load_worker_utilization_tables(
	users_list: list[str],
) -> dict[str, list[dict[str, str | float]]]:
	"""Worker.utilization (Worker Utilization Table) по email пользователя."""
	if not users_list:
		return {}

	workers = frappe.get_list(
		"Worker",
		filters={"wuser": ["in", users_list]},
		fields=["name", "wuser"],
	)
	if not workers:
		return {}

	worker_by_name = {row["name"]: row["wuser"] for row in workers if row.get("name")}
	util_rows = frappe.qb.get_query(
		"Worker Utilization Table",
		fields=["parent", "util_valid_from", "utilization"],
		filters=[
			["parent", "in", list(worker_by_name.keys())],
			["parenttype", "=", "Worker"],
			["parentfield", "=", "utilization"],
		],
	).run(as_dict=True)

	result: dict[str, list[dict[str, str | float]]] = {}
	for row in util_rows:
		user_email = worker_by_name.get(row.parent)
		if not user_email:
			continue
		result.setdefault(user_email, []).append(
			{
				"util_valid_from": str(row.util_valid_from) if row.util_valid_from else "",
				"utilization": float(row.utilization or 0),
			}
		)
	return result


def load_project_utilization_tables(
	projects_list: list[str],
) -> dict[str, list[ProjectUtilizationRow]]:
	"""Project.custom_project_utilization (Project Utilization Table) по project id."""
	if not projects_list:
		return {}

	util_rows = frappe.qb.get_query(
		"Project Utilization Table",
		fields=["parent", "pu_valid_from", "pu_included"],
		filters=[
			["parent", "in", projects_list],
			["parenttype", "=", "Project"],
			["parentfield", "=", "custom_project_utilization"],
		],
	).run(as_dict=True)

	result: dict[str, list[ProjectUtilizationRow]] = {}
	for row in util_rows:
		project_id = row.parent
		if not project_id:
			continue
		result.setdefault(project_id, []).append(
			ProjectUtilizationRow(
				pu_valid_from=str(row.pu_valid_from) if row.pu_valid_from else "",
				pu_included=row.pu_included or "",
			)
		)
	return result


def load_company_holiday_lists(companies: set[str] | list[str]) -> dict[str, str]:
	"""Company.name -> default_holiday_list для fallback календаря проекта."""
	if not companies:
		return {}
	company_rows = frappe.qb.get_query(
		"Company",
		fields=["name", "default_holiday_list"],
		filters=[["name", "in", list(companies)]],
	).run(as_dict=True)
	return {
		row["name"]: row["default_holiday_list"]
		for row in company_rows
		if row.get("default_holiday_list")
	}


def resolve_project_holiday_list(
	project_info: ProjectWorkloadInfo | dict,
	company_holiday_lists: dict[str, str] | None = None,
) -> str | None:
	"""Project.holiday_list, иначе Company.default_holiday_list.

	`effective_holiday_list` from `load_projects` is the same fallback already
	resolved — use it when the company map is not passed (PWR project-row).
	"""
	if not project_info:
		return None
	holiday_list = project_info.get("holiday_list")
	if holiday_list:
		return holiday_list
	effective = project_info.get("effective_holiday_list")
	if effective:
		return effective
	company = project_info.get("company")
	if company and company_holiday_lists:
		return company_holiday_lists.get(company)
	return None


def load_projects(projects_list: list[str]) -> dict[str, ProjectWorkloadInfo]:
	projects_data: dict[str, ProjectWorkloadInfo] = {}
	if not projects_list:
		return projects_data

	fields = ["name", "project_name", "holiday_list", "company"]
	if frappe.get_meta("Project").has_field("custom_working_hours_on_date"):
		fields.append("custom_working_hours_on_date")
	projects_db = frappe.qb.get_query(
		"Project",
		fields=fields,
		filters=[["name", "in", projects_list]],
	).run(as_dict=True)
	company_holiday_lists = load_company_holiday_lists({
		row["company"] for row in projects_db if row.get("company")
	})
	for project_row in projects_db:
		project_info = ProjectWorkloadInfo(
			name=project_row["name"],
			project_name=project_row.get("project_name"),
			holiday_list=project_row.get("holiday_list"),
			company=project_row.get("company"),
		)
		project_info["effective_holiday_list"] = resolve_project_holiday_list(
			project_info,
			company_holiday_lists,
		)
		whod = project_row.get("custom_working_hours_on_date")
		if whod:
			project_info["working_hours_on_date"] = whod
		projects_data[project_row["name"]] = project_info
	return projects_data


def load_tasks(tasks_list: list[str]) -> dict[str, TaskWorkloadInfo]:
	tasks_data: dict[str, TaskWorkloadInfo] = {}
	if not tasks_list:
		return tasks_data

	tasks_db = frappe.qb.get_query(
		"Task",
		fields=["name", "subject"],
		filters=[["name", "in", tasks_list]],
	).run(as_dict=True)
	for task_row in tasks_db:
		tasks_data[task_row["name"]] = TaskWorkloadInfo(
			name=task_row["name"],
			subject=task_row.get("subject"),
		)
	return tasks_data


def load_working_hours_overrides(
	users_data: dict[str, UserWorkloadInfo],
	projects_data: dict[str, ProjectWorkloadInfo] | None = None,
) -> dict[str, dict[str, float]]:
	working_hours_overrides: dict[str, dict[str, float]] = {}
	working_hours_refs: set[str] = set()
	for user_data in users_data.values():
		ref = user_data.get("tt_working_hours_on_date")
		if ref:
			working_hours_refs.add(ref)
	for project_data in (projects_data or {}).values():
		ref = project_data.get("working_hours_on_date")
		if ref:
			working_hours_refs.add(ref)

	if not working_hours_refs:
		return working_hours_overrides

	overrides = frappe.qb.get_query(
		"Working Hours Table",
		fields=["parent as ref_name", "wht_date", "wht_hours"],
		filters=[
			["parent", "in", list(working_hours_refs)],
			["parentfield", "=", "hod_working_hours_table"],
			["parenttype", "=", "Working Hours On Date"],
		],
	).run(as_dict=True)
	for row in overrides:
		if row.ref_name not in working_hours_overrides:
			working_hours_overrides[row.ref_name] = {}
		if row.wht_date:
			working_hours_overrides[row.ref_name][str(row.wht_date)] = float(row.wht_hours or 0)
	return working_hours_overrides


def load_holiday_data(
	users_data: dict[str, UserWorkloadInfo],
	projects_data: dict[str, ProjectWorkloadInfo],
) -> tuple[dict[str, list[HolidayEntry]], dict[str, dict[str, bool]]]:
	"""Возвращает (holiday_lists_cache, holiday_date_sets)."""
	holiday_lists_cache: dict[str, list[HolidayEntry]] = {}
	holiday_date_sets: dict[str, dict[str, bool]] = {}
	all_holiday_lists: set[str] = set()

	for project in projects_data.values():
		effective_holiday_list = project.get("effective_holiday_list") or resolve_project_holiday_list(project)
		if effective_holiday_list:
			all_holiday_lists.add(effective_holiday_list)
	for user in users_data.values():
		if user.get("wholiday_list"):
			all_holiday_lists.add(user["wholiday_list"])

	if not all_holiday_lists:
		return holiday_lists_cache, holiday_date_sets

	holidays = frappe.qb.get_query(
		"Holiday",
		fields=["parent as list_name", "holiday_date", "description", "weekly_off"],
		filters=[
			["parent", "in", list(all_holiday_lists)],
			["parentfield", "=", "holidays"],
			["parenttype", "=", "Holiday List"],
		],
	).run(as_dict=True)
	for row in holidays:
		list_name = row.list_name
		if list_name not in holiday_lists_cache:
			holiday_lists_cache[list_name] = []
			holiday_date_sets[list_name] = {}
		holiday_item = HolidayEntry(
			date=str(row.holiday_date),
			description=row.description,
			weekly_off=row.weekly_off,
		)
		holiday_lists_cache[list_name].append(holiday_item)
		holiday_date_sets[list_name][str(row.holiday_date)] = True

	return holiday_lists_cache, holiday_date_sets


def load_user_absences(
	users_list: list[str],
	*,
	min_end_date: str | date | None = None,
) -> dict[str, list[AbsenceEntry]]:
	"""min_end_date: PWR — today; flat report — from_date фильтра."""
	user_absences: dict[str, list[AbsenceEntry]] = {}
	if not users_list:
		return user_absences

	if min_end_date is None:
		# Call through frappe.utils so tests can monkeypatch nowdate.
		min_end_date = frappe.utils.nowdate()

	absences = frappe.qb.get_query(
		"Application For Leave",
		fields=[
			"lauser",
			"alfrom_date",
			"alto_date",
			"altype_of_leave",
			"alfrom_hours",
			"alto_hours",
		],
		filters=[
			["lauser", "in", users_list],
			["status", "=", "Согласовано"],
			["alfrom_date", "is", "set"],
			["alto_date", "is", "set"],
			["alto_date", ">=", getdate(min_end_date)],
		],
	).run(as_dict=True)
	for absence in absences:
		user_email = absence.lauser
		if user_email not in user_absences:
			user_absences[user_email] = []
		user_absences[user_email].append(
			AbsenceEntry(
				from_date=absence.alfrom_date,
				to_date=absence.alto_date,
				type=absence.altype_of_leave,
				alfrom_hours=absence.alfrom_hours,
				alto_hours=absence.alto_hours,
			)
		)
	return user_absences


def load_monthly_plan_cache(
	assignments: list[AssignmentRow] | list[dict],
) -> dict[str, float]:
	monthly_plan_cache: dict[str, float] = {}
	tasks_set: set[str] = set()
	roles_set: set[str] = set()
	has_pairs = False

	for assignment in assignments:
		task = assignment.get("task")
		role = assignment.get("role")
		if task and role:
			has_pairs = True
			tasks_set.add(task)
			roles_set.add(role)

	if not has_pairs:
		return monthly_plan_cache

	PWE = frappe.qb.DocType("Project Work Efforts")
	PWEA = frappe.qb.DocType("Project Work Efforts Amount")
	plans = (
		frappe.qb.from_(PWE)
		.inner_join(PWEA)
		.on(PWEA.parent == PWE.name)
		.select(
			PWE.pwe_task.as_("task"),
			PWE.pwe_project_role.as_("role"),
			PWEA.pwea_year.as_("year"),
			PWEA.pwea_month.as_("month"),
			PWEA.pwea_plan.as_("plan_hours"),
		)
		.where(PWE.pwe_task.isin(list(tasks_set)))
		.where(PWE.pwe_project_role.isin(list(roles_set)))
		.where(PWEA.pwea_plan > 0)
	).run(as_dict=True)
	for plan in plans:
		key = f"{plan['task']}_{plan['role']}_{plan['year']}_{plan['month']}"
		monthly_plan_cache[key] = float(plan["plan_hours"] or 0)
	return monthly_plan_cache
