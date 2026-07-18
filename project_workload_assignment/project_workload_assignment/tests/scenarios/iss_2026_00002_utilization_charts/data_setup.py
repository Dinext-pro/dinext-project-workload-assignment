# Copyright (c) 2026, Dinext
"""Детерминированные данные для графиков утилизации PWR (ISS-2026-00002)."""

from __future__ import annotations

import frappe

PREFIX = "ISS-2026-00002-UTIL"
ROLE_NAME = f"{PREFIX} Role"
USER_GROUP_NAME = f"{PREFIX}-UG"
BUSINESS_USER = "Administrator"

USER_A = "iss-2026-00002-util-a@example.com"
USER_B = "iss-2026-00002-util-b@example.com"
USER_C = "iss-2026-00002-util-c@example.com"

PROJECT_COMM_ID = f"{PREFIX}-COMM"
PROJECT_INT_ID = f"{PREFIX}-INT"
PROJECT_COMM_NAME = f"{PREFIX} COMM"
PROJECT_INT_NAME = f"{PREFIX} INT"

TASK_TYPE = "Stage"
WORKLOAD_TYPE = "В рабочих часах"

WEEK_START = "2026-06-01"
WEEK_END = "2026-06-07"
UTIL_VALID_FROM = "2026-01-01"
PU_VALID_FROM = "2026-01-01"
EMPLOYEE_UTIL_PCT = 80.0

HOURS_A_COMM = 40.0
HOURS_A_INT = 20.0
HOURS_C_COMM = 30.0
EXPECTED_UTIL_FORECAST = HOURS_A_COMM
EXPECTED_STACKED_TOTAL = HOURS_A_COMM + HOURS_A_INT + HOURS_C_COMM

_PWR_COMPANY_DEFAULT_HL_SAVED = False
_PWR_COMPANY_DEFAULT_HL_VALUE: str | None = None
_PWR_COMPANY_DEFAULT_HL_NAME: str | None = None


def owned_entities() -> dict[str, list[str]]:
	return {
		"Project": [f"project_name like {PREFIX}%"],
		"Task": [f"subject like {PREFIX}%"],
		"Project Workload Assignment": ["task in owned tasks"],
		"Project Role": [ROLE_NAME],
		"User": [USER_A, USER_B, USER_C],
		"User Group": [USER_GROUP_NAME],
		"Worker": ["wuser in scenario users"],
	}


def _default_company() -> str | None:
	row = frappe.db.sql("select name from `tabCompany` limit 1", as_dict=True)
	return row[0].name if row else None


def _default_project_type_name() -> str | None:
	for cand in ("Внутренний", "Internal", "Коммерческий", "External"):
		if frappe.db.exists("Project Type", cand):
			return cand
	row = frappe.db.sql("select name from `tabProject Type` limit 1", as_dict=True)
	return row[0].name if row else None


def _default_project_payment_scheme_name() -> str | None:
	for cand in ("Неоплачиваемый", "Время и затраты (T&M)", "Фикс. стоимость"):
		if frappe.db.exists("Project Payment Scheme", cand):
			return cand
	row = frappe.db.sql("select name from `tabProject Payment Scheme` limit 1", as_dict=True)
	return row[0].name if row else None


def _detach_company_default_holiday_list(company: str) -> None:
	global _PWR_COMPANY_DEFAULT_HL_SAVED, _PWR_COMPANY_DEFAULT_HL_VALUE, _PWR_COMPANY_DEFAULT_HL_NAME
	if not company:
		return
	if not _PWR_COMPANY_DEFAULT_HL_SAVED:
		_PWR_COMPANY_DEFAULT_HL_VALUE = frappe.db.get_value("Company", company, "default_holiday_list")
		_PWR_COMPANY_DEFAULT_HL_NAME = company
		_PWR_COMPANY_DEFAULT_HL_SAVED = True
	frappe.db.set_value("Company", company, "default_holiday_list", None, update_modified=False)


def _restore_company_default_holiday_list_if_saved() -> None:
	global _PWR_COMPANY_DEFAULT_HL_SAVED, _PWR_COMPANY_DEFAULT_HL_VALUE, _PWR_COMPANY_DEFAULT_HL_NAME
	if not _PWR_COMPANY_DEFAULT_HL_SAVED or not _PWR_COMPANY_DEFAULT_HL_NAME:
		return
	frappe.db.set_value(
		"Company",
		_PWR_COMPANY_DEFAULT_HL_NAME,
		"default_holiday_list",
		_PWR_COMPANY_DEFAULT_HL_VALUE,
		update_modified=False,
	)
	_PWR_COMPANY_DEFAULT_HL_SAVED = False
	_PWR_COMPANY_DEFAULT_HL_VALUE = None
	_PWR_COMPANY_DEFAULT_HL_NAME = None


def _admin_worker_template_context() -> dict | None:
	return frappe.db.get_value(
		"Worker",
		{"wuser": BUSINESS_USER},
		["wtimesheet_template", "wuser_group", "wholiday_list"],
		as_dict=True,
	)


def _ensure_test_user(email: str, first_name: str) -> str:
	if frappe.db.exists("User", email):
		return email
	doc = frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": first_name,
			"last_name": "",
			"enabled": 1,
			"send_welcome_email": 0,
			"new_password": "Test-Util-00002",
		}
	)
	doc.insert(ignore_permissions=True, ignore_mandatory=True)
	return email


def _ensure_worker(
	email: str,
	*,
	wtype: str,
	utilization_rows: list[dict] | None = None,
	wvalid_from: str = UTIL_VALID_FROM,
	wvalid_for: str | None = None,
) -> str:
	existing = frappe.db.get_value("Worker", {"wuser": email}, "name")
	if existing:
		worker_name = existing
	else:
		admin_w = _admin_worker_template_context()
		if not admin_w or not admin_w.get("wtimesheet_template"):
			frappe.throw("У Administrator нет Worker/wtimesheet_template — сценарий недоступен")
		whl = admin_w.get("wholiday_list")
		if not whl:
			company = _default_company()
			if company:
				whl = frappe.db.get_value("Company", company, "default_holiday_list")
		ug = admin_w.get("wuser_group")
		if not whl or not ug:
			frappe.throw("Нет wholiday_list или wuser_group для создания Worker")
		doc = frappe.get_doc(
			{
				"doctype": "Worker",
				"wuser": email,
				"wuser_group": ug,
				"wtimesheet_template": admin_w["wtimesheet_template"],
				"wholiday_list": whl,
				"wvalid_from": wvalid_from,
				"wvalid_for": wvalid_for,
				"utilization": utilization_rows or [],
			}
		)
		doc.insert(ignore_permissions=True, ignore_mandatory=True)
		worker_name = doc.name

	frappe.db.set_value("Worker", worker_name, "wtype", wtype, update_modified=False)
	frappe.db.set_value("Worker", worker_name, "wvalid_from", wvalid_from, update_modified=False)
	frappe.db.set_value("Worker", worker_name, "wvalid_for", wvalid_for, update_modified=False)

	worker_doc = frappe.get_doc("Worker", worker_name)
	worker_doc.set("utilization", utilization_rows or [])
	worker_doc.flags.ignore_validate = True
	worker_doc.save(ignore_permissions=True)
	return worker_name


def ensure_project_role() -> str:
	if not frappe.db.exists("Project Role", ROLE_NAME):
		frappe.get_doc(
			{
				"doctype": "Project Role",
				"role_name": ROLE_NAME,
				"enabled": 1,
			}
		).insert(ignore_permissions=True)
	return ROLE_NAME


def _ensure_user_group() -> str:
	members = [{"user": USER_A}, {"user": USER_B}, {"user": USER_C}]
	if frappe.db.exists("User Group", USER_GROUP_NAME):
		doc = frappe.get_doc("User Group", USER_GROUP_NAME)
		doc.set("user_group_members", members)
		doc.flags.ignore_links = True
		doc.save(ignore_permissions=True)
		return USER_GROUP_NAME
	frappe.get_doc(
		{
			"doctype": "User Group",
			"name": USER_GROUP_NAME,
			"user_group_members": members,
		}
	).insert(ignore_permissions=True)
	return USER_GROUP_NAME


def _delete_user_group() -> None:
	if not frappe.db.exists("User Group", USER_GROUP_NAME):
		return
	try:
		frappe.delete_doc("User Group", USER_GROUP_NAME, force=True, ignore_permissions=True)
	except Exception:
		frappe.db.delete("User Group Member", {"parent": USER_GROUP_NAME})
		frappe.db.delete("User Group", {"name": USER_GROUP_NAME})


def _create_project(
	company: str,
	*,
	project_id: str,
	project_name: str,
	pu_included: str,
) -> str:
	existing = frappe.get_all(
		"Project",
		filters={"name": project_id},
		limit=1,
		pluck="name",
		ignore_permissions=True,
	)
	if existing:
		project_name_db = existing[0]
	else:
		pt = _default_project_type_name()
		pps = _default_project_payment_scheme_name()
		if not pt or not pps:
			frappe.throw("Нет Project Type или Project Payment Scheme для создания Project")
		doc = frappe.get_doc(
			{
				"doctype": "Project",
				"name": project_id,
				"project_name": project_name,
				"project_type": pt,
				"custom_payment_scheme": pps,
				"company": company,
				"status": "Open",
				"expected_start_date": WEEK_START,
				"expected_end_date": WEEK_END,
				"custom_project_utilization": [
					{
						"pu_valid_from": PU_VALID_FROM,
						"pu_included": pu_included,
					}
				],
			}
		)
		doc.insert(ignore_permissions=True)
		project_name_db = doc.name

	proj = frappe.get_doc("Project", project_name_db)
	proj.set(
		"custom_project_utilization",
		[
			{
				"pu_valid_from": PU_VALID_FROM,
				"pu_included": pu_included,
			}
		],
	)
	proj.flags.ignore_validate = True
	proj.save(ignore_permissions=True)
	return project_name_db


def _create_task(project_name: str, subject_suffix: str) -> str:
	subject = f"{PREFIX} {subject_suffix}"
	task = frappe.get_doc(
		{
			"doctype": "Task",
			"subject": subject,
			"status": "Open",
			"type": TASK_TYPE,
			"project": project_name,
			"exp_start_date": WEEK_START,
			"exp_end_date": WEEK_END,
			"is_group": 0,
		}
	)
	task.insert(ignore_permissions=True)
	return task.name


def _create_pwa(task: str, user: str, wl_hours: float) -> str:
	doc = frappe.get_doc(
		{
			"doctype": "Project Workload Assignment",
			"task": task,
			"role": ensure_project_role(),
			"user": user,
			"task_dates": 1,
			"date_from": WEEK_START,
			"date_to": WEEK_END,
			"workload": WORKLOAD_TYPE,
			"wl_value": wl_hours,
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def reset_owned_data() -> None:
	_restore_company_default_holiday_list_if_saved()
	_delete_user_group()

	task_names = frappe.get_all(
		"Task",
		filters={"subject": ["like", f"{PREFIX}%"]},
		pluck="name",
		order_by="lft desc",
		ignore_permissions=True,
	)
	for task_name in task_names:
		for pwa in frappe.get_all(
			"Project Workload Assignment",
			filters={"task": task_name},
			pluck="name",
			ignore_permissions=True,
		):
			frappe.delete_doc("Project Workload Assignment", pwa, force=True, ignore_permissions=True)
		frappe.delete_doc("Task", task_name, force=True, ignore_permissions=True)

	for proj in frappe.get_all(
		"Project",
		filters={"project_name": ["like", f"{PREFIX}%"]},
		pluck="name",
		ignore_permissions=True,
	):
		frappe.delete_doc("Project", proj, force=True, ignore_permissions=True)

	for email in (USER_A, USER_B, USER_C):
		worker = frappe.db.get_value("Worker", {"wuser": email}, "name")
		if worker:
			frappe.delete_doc("Worker", worker, force=True, ignore_permissions=True)
		if frappe.db.exists("User", email):
			frappe.delete_doc("User", email, force=True, ignore_permissions=True)

	if frappe.db.exists("Project Role", ROLE_NAME):
		frappe.delete_doc("Project Role", ROLE_NAME, force=True, ignore_permissions=True)


def prepare_utilization_charts_case(
	*,
	wvalid_for_a: str | None = None,
) -> dict[str, str | float]:
	"""Employee A/B, Supplier C; COMM (pu=Да), INT (pu=Нет); PWA 40+20+30 ч."""
	reset_owned_data()
	company = _default_company()
	if not company:
		frappe.throw("Нет Company в базе — сценарий не может создать Project")
	_detach_company_default_holiday_list(company)
	ensure_project_role()

	util_row = [{"util_valid_from": UTIL_VALID_FROM, "utilization": EMPLOYEE_UTIL_PCT}]
	_ensure_test_user(USER_A, "UtilA")
	_ensure_test_user(USER_B, "UtilB")
	_ensure_test_user(USER_C, "UtilC")
	_ensure_user_group()
	_ensure_worker(
		USER_A,
		wtype="Employee",
		utilization_rows=util_row,
		wvalid_for=wvalid_for_a,
	)
	_ensure_worker(USER_B, wtype="Employee", utilization_rows=[])
	_ensure_worker(USER_C, wtype="Supplier", utilization_rows=util_row)

	project_comm = _create_project(
		company,
		project_id=PROJECT_COMM_ID,
		project_name=PROJECT_COMM_NAME,
		pu_included="Да",
	)
	project_int = _create_project(
		company,
		project_id=PROJECT_INT_ID,
		project_name=PROJECT_INT_NAME,
		pu_included="Нет",
	)
	task_comm = _create_task(project_comm, "COMM")
	task_int = _create_task(project_int, "INT")
	pwa_a_comm = _create_pwa(task_comm, USER_A, HOURS_A_COMM)
	pwa_a_int = _create_pwa(task_int, USER_A, HOURS_A_INT)
	pwa_c_comm = _create_pwa(task_comm, USER_C, HOURS_C_COMM)

	return {
		"company": company,
		"user_group": USER_GROUP_NAME,
		"user_a": USER_A,
		"user_b": USER_B,
		"user_c": USER_C,
		"project_comm": project_comm,
		"project_int": project_int,
		"task_comm": task_comm,
		"task_int": task_int,
		"pwa_a_comm": pwa_a_comm,
		"pwa_a_int": pwa_a_int,
		"pwa_c_comm": pwa_c_comm,
		"week_start": WEEK_START,
		"week_end": WEEK_END,
		"expected_util_forecast": EXPECTED_UTIL_FORECAST,
		"expected_stacked_total": EXPECTED_STACKED_TOTAL,
	}


def reset() -> None:
	reset_owned_data()
