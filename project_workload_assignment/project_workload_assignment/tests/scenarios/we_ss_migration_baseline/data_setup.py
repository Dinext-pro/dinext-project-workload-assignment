# Copyright (c) 2026, Dinext
"""Owned-данные для baseline Server Script Work Efforts (WE-SS-MIG-BASE)."""

from __future__ import annotations

import frappe

PREFIX = "WE-SS-MIG-BASE"
ROLE_NAME = f"{PREFIX} Role"
BUSINESS_USER = "Administrator"
SETUP_USER = "Administrator"

DEPENDENCY_PROJECT = "TEST-V15.106.0 (HEAD)"

TASK_TYPE = "Stage"
WEEK_START = "2026-05-04"
WEEK_END = "2026-05-10"

PLAN_YEAR = 2026
PLAN_MONTH = 7
INITIAL_PLAN = 5.0
NEW_PLAN = 42.5

LIMITS_POSITION_NAME = "UTP-WE-SS-MIG-BASE-LIMIT-01"
LIMITS_TIMESHEET_NAME = f"{PREFIX}-TS-DRAFT"
LIMITS_TASK = "TASK-2026-00137"
LIMITS_ROLE = "Разработчик"
LIMITS_YEAR = 2026
LIMITS_MONTH = 6
LIMITS_HOURS = 10.0


def owned_entities() -> dict[str, list[str]]:
	return {
		"Project": [f"project_name like {PREFIX}%"],
		"Task": [f"subject like {PREFIX}%"],
		"Project Work Efforts": ["pwe_task in owned tasks"],
		"Project Role": [ROLE_NAME],
	}


def reset_scope() -> dict[str, list[str]]:
	return owned_entities()


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


def _pick_fiscal_year(year: int, month: int) -> str | None:
	start = f"{year}-{month:02d}-01"
	end = frappe.utils.get_last_day(start)
	rows = frappe.db.sql(
		"""
		select name from `tabFiscal Year`
		where year_start_date <= %(end)s and year_end_date >= %(start)s
		limit 1
		""",
		{"start": start, "end": end},
	)
	return rows[0][0] if rows else None


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


def reset_owned_data() -> None:
	task_names = frappe.get_all(
		"Task",
		filters={"subject": ["like", f"{PREFIX}%"]},
		pluck="name",
		order_by="lft desc",
		ignore_permissions=True,
	)
	if task_names:
		for pwe in frappe.get_all(
			"Project Work Efforts",
			filters={"pwe_task": ["in", task_names]},
			pluck="name",
			ignore_permissions=True,
		):
			frappe.delete_doc("Project Work Efforts", pwe, force=True, ignore_permissions=True)

	for task_name in task_names:
		frappe.delete_doc("Task", task_name, force=True, ignore_permissions=True)

	for proj in frappe.get_all(
		"Project",
		filters={"project_name": ["like", f"{PREFIX}%"]},
		pluck="name",
		ignore_permissions=True,
	):
		frappe.delete_doc("Project", proj, force=True, ignore_permissions=True)

	if frappe.db.exists("Project Role", ROLE_NAME):
		frappe.delete_doc("Project Role", ROLE_NAME, force=True, ignore_permissions=True)


def dependency_project_available() -> bool:
	return bool(frappe.db.exists("Project", DEPENDENCY_PROJECT))


def server_script_available(api_method: str) -> bool:
	return bool(
		frappe.db.get_value(
			"Server Script",
			{"api_method": api_method, "disabled": 0},
			"name",
		)
	)


def _create_project(company: str) -> str:
	project_name = f"{PREFIX} Project"
	project_id = f"{PREFIX}-PRJ"
	existing = frappe.get_all(
		"Project",
		filters={"project_name": project_name},
		limit=1,
		pluck="name",
		ignore_permissions=True,
	)
	if existing:
		return existing[0]

	pt = _default_project_type_name()
	pps = _default_project_payment_scheme_name()
	if not pt or not pps:
		frappe.throw("Нет Project Type или Project Payment Scheme — TC-03 недоступен")

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
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def _create_task(project_name: str) -> str:
	task = frappe.get_doc(
		{
			"doctype": "Task",
			"subject": f"{PREFIX} Leaf",
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


def _create_pwe(project: str, task: str, role: str, fiscal_year: str, plan: float) -> str:
	doc = frappe.get_doc(
		{
			"doctype": "Project Work Efforts",
			"pwe_project": project,
			"pwe_task": task,
			"pwe_project_role": role,
			"pwe_amount": [
				{
					"pwea_year": fiscal_year,
					"pwea_month": PLAN_MONTH,
					"pwea_plan": plan,
					"pwea_expected": 0,
				}
			],
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def prepare_case_save_forecast_as_plan() -> dict[str, str | int | float]:
	"""Минимальный owned Project + Task + PWE для TC-03."""
	if not frappe.db.exists("DocType", "Project Work Efforts"):
		frappe.throw("DocType Project Work Efforts не установлен")

	reset_owned_data()
	company = _default_company()
	if not company:
		frappe.throw("Нет Company в базе")

	fiscal_year = _pick_fiscal_year(PLAN_YEAR, PLAN_MONTH)
	if not fiscal_year:
		frappe.throw("Нет Fiscal Year на интервал TC-03")

	role = ensure_project_role()
	project = _create_project(company)
	task = _create_task(project)
	pwe = _create_pwe(project, task, role, fiscal_year, INITIAL_PLAN)

	return {
		"company": company,
		"project": project,
		"task": task,
		"role": role,
		"pwe": pwe,
		"fiscal_year": fiscal_year,
		"year": PLAN_YEAR,
		"month": PLAN_MONTH,
		"initial_plan": INITIAL_PLAN,
		"new_plan": NEW_PLAN,
	}


def get_pwe_plan(pwe_name: str, fiscal_year: str, month: int) -> float:
	doc = frappe.get_doc("Project Work Efforts", pwe_name)
	for row in doc.pwe_amount:
		if str(row.pwea_year) == str(fiscal_year) and int(row.pwea_month) == int(month):
			return float(row.pwea_plan or 0)
	return 0.0


def build_limits_positions_payload() -> list[dict]:
	"""Минимальный positions для TC-02 на dependency-проекте TEST-V15.106.0 (HEAD)."""
	return [
		{
			"name": LIMITS_POSITION_NAME,
			"document_name": LIMITS_TASK,
			"project_role": LIMITS_ROLE,
			"project": DEPENDENCY_PROJECT,
			"status": "Черновик",
			"year": LIMITS_YEAR,
			"month": LIMITS_MONTH,
			"all_hours": LIMITS_HOURS,
			"custom_username": BUSINESS_USER,
		}
	]


def reset() -> None:
	reset_owned_data()
