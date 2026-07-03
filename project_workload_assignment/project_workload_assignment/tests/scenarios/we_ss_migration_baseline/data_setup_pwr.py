# Copyright (c) 2026, Dinext
"""Детерминированные данные для baseline PWR Server Scripts (check_workload_overload, update_forecast)."""

from __future__ import annotations

import json

import frappe

PREFIX = "WE-SS-MIG-PWR"
ROLE_NAME = f"{PREFIX} Role"
BUSINESS_USER = "Administrator"
TASK_TYPE = "Stage"
WORKLOAD_TYPE = "В рабочих часах"

DEPENDENCY_PROJECT = "TEST-V15.106.0 (HEAD)"

MONTH_START = "2026-06-01"
MONTH_END = "2026-06-30"
FORECAST_YEAR = 2026
FORECAST_MONTH = 6
ASSIGNED_HOURS = 40.0
INITIAL_FORECAST = 10.0

TC01_PERIODS = [{"year": 2026, "month": m, "is_past": False} for m in range(6, 13)]
TC01_VIEW_OPTIONS = "Прогноз и факт"


def owned_entities() -> dict[str, list[str]]:
	return {
		"Project": [f"project_name like {PREFIX}%"],
		"Task": [f"subject like {PREFIX}%"],
		"Project Workload Assignment": ["task in owned tasks"],
		"Project Work Efforts": ["pwe_task in owned tasks"],
		"Project Role": [ROLE_NAME],
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

	if frappe.db.exists("Project Role", ROLE_NAME):
		frappe.delete_doc("Project Role", ROLE_NAME, force=True, ignore_permissions=True)


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
		frappe.throw("Нет Project Type или Project Payment Scheme — сценарий не может создать Project")

	doc = frappe.get_doc(
		{
			"doctype": "Project",
			"name": project_id,
			"project_name": project_name,
			"project_type": pt,
			"custom_payment_scheme": pps,
			"company": company,
			"status": "Open",
			"expected_start_date": MONTH_START,
			"expected_end_date": MONTH_END,
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def _create_task(project_name: str) -> str:
	task = frappe.get_doc(
		{
			"doctype": "Task",
			"subject": f"{PREFIX} Forecast leaf",
			"status": "Open",
			"type": TASK_TYPE,
			"project": project_name,
			"exp_start_date": MONTH_START,
			"exp_end_date": MONTH_END,
			"is_group": 0,
		}
	)
	task.insert(ignore_permissions=True)
	return task.name


def _create_pwa(task: str, wl_hours: float) -> str:
	doc = frappe.get_doc(
		{
			"doctype": "Project Workload Assignment",
			"task": task,
			"role": ensure_project_role(),
			"user": BUSINESS_USER,
			"task_dates": 1,
			"date_from": MONTH_START,
			"date_to": MONTH_END,
			"workload": WORKLOAD_TYPE,
			"wl_value": wl_hours,
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def _create_pwe_with_forecast(
	project: str,
	task: str,
	role: str,
	fiscal_year: str,
	*,
	expected: float,
) -> str:
	doc = frappe.get_doc(
		{
			"doctype": "Project Work Efforts",
			"pwe_project": project,
			"pwe_task": task,
			"pwe_project_role": role,
			"pwe_amount": [
				{
					"pwea_year": fiscal_year,
					"pwea_month": FORECAST_MONTH,
					"pwea_expected": expected,
				}
			],
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def prepare_case_update_forecast_from_assignments(
	assigned_hours: float = ASSIGNED_HOURS,
	initial_forecast: float = INITIAL_FORECAST,
) -> dict[str, str | float]:
	"""Минимальный owned Project + Task + PWA + PWE для TC-02."""
	if not frappe.db.exists("DocType", "Project Work Efforts"):
		frappe.throw("DocType Project Work Efforts не установлен")

	reset_owned_data()
	company = _default_company()
	if not company:
		frappe.throw("Нет Company в базе — сценарий не может создать Project")

	fiscal_year = _pick_fiscal_year(FORECAST_YEAR, FORECAST_MONTH)
	if not fiscal_year:
		frappe.throw("Нет Fiscal Year на июнь 2026 — пропустите TC-02 или создайте FY")

	role = ensure_project_role()
	project = _create_project(company)
	task = _create_task(project)
	pwa = _create_pwa(task, assigned_hours)
	pwe = _create_pwe_with_forecast(
		project,
		task,
		role,
		fiscal_year,
		expected=initial_forecast,
	)

	return {
		"company": company,
		"project": project,
		"task": task,
		"pwa": pwa,
		"pwe": pwe,
		"role": role,
		"fiscal_year": fiscal_year,
		"year": FORECAST_YEAR,
		"month": FORECAST_MONTH,
		"assigned_hours": assigned_hours,
		"initial_forecast": initial_forecast,
	}


def _run_api_server_script(api_method: str, form_data: dict) -> dict:
	"""Вызов API Server Script в контексте bench run-tests (как HTTP /api/method/...)."""
	prev_form = getattr(frappe.local, "form_dict", None)
	prev_response = getattr(frappe.local, "response", None)
	frappe.local.form_dict = frappe._dict(form_data)
	# truthy response нужен safe_exec (см. safe_exec.get_safe_globals: if frappe.response)
	frappe.local.response = frappe._dict({"message": {}})
	try:
		scripts = frappe.get_all(
			"Server Script",
			filters={"api_method": api_method, "disabled": 0},
			pluck="name",
			limit=1,
		)
		if not scripts:
			frappe.throw(f"Active Server Script {api_method!r} not found")
		frappe.get_doc("Server Script", scripts[0]).execute_method()
		return dict(frappe.local.response.get("message") or {})
	finally:
		frappe.local.form_dict = prev_form
		frappe.local.response = prev_response if prev_response is not None else frappe._dict()


def call_check_workload_overload(project: str, periods: list, view_options: str) -> dict:
	"""Вызов через активный Server Script (SS-путь)."""
	return _run_api_server_script(
		"check_workload_overload",
		{
			"project": project,
			"periods": periods,
			"view_options": view_options,
		},
	)


def call_update_forecast_from_assignments(project: str, updates: list[dict]) -> dict:
	"""Вызов через активный Server Script (SS-путь)."""
	return _run_api_server_script(
		"update_forecast_from_assignments",
		{
			"project": project,
			"updates_json": json.dumps(updates, ensure_ascii=False),
		},
	)


# ==================== Python-путь (прямой вызов модуля) ====================

def call_check_workload_overload_python(project: str, periods: list, view_options: str) -> dict:
	"""Прямой вызов Python-модуля workload_overload (без SS)."""
	from project_workload_assignment.project_workload_assignment.project_workload.project_report.overload_check import (
		run_check_workload_overload,
	)

	return run_check_workload_overload(frappe._dict({
		"project": project,
		"periods": periods,
		"view_options": view_options,
	}))


def call_update_forecast_from_assignments_python(project: str, updates: list[dict]) -> dict:
	"""Прямой вызов Python-модуля forecast_from_assignments (без SS)."""
	from project_workload_assignment.project_workload_assignment.project_workload.forecast.forecast_from_assignments import (
		run_update_forecast_from_assignments,
	)

	return run_update_forecast_from_assignments(frappe._dict({
		"project": project,
		"updates_json": json.dumps(updates, ensure_ascii=False),
	}))


def get_pwe_expected_for_period(pwe_name: str, year: int, month: int) -> float:
	doc = frappe.get_doc("Project Work Efforts", pwe_name)
	for row in doc.pwe_amount:
		if int(row.pwea_year if not row.pwea_year.isdigit() else row.pwea_year) == year:
			pass
		row_year = row.pwea_year
		if isinstance(row_year, str) and not row_year.isdigit():
			fy_start = frappe.db.get_value("Fiscal Year", row_year, "year_start_date")
			if fy_start:
				row_year = frappe.utils.getdate(fy_start).year
		if int(row_year) == year and int(row.pwea_month) == month:
			return float(row.pwea_expected or 0)
		if row.pwea_year == frappe.db.get_value(
			"Fiscal Year",
			{"year_start_date": ["<=", f"{year}-{month:02d}-01"]},
			"name",
		) and int(row.pwea_month) == month:
			return float(row.pwea_expected or 0)
	return 0.0


def get_pwe_expected_by_fy_month(pwe_name: str, fiscal_year: str, month: int) -> float:
	doc = frappe.get_doc("Project Work Efforts", pwe_name)
	for row in doc.pwe_amount:
		if row.pwea_year == fiscal_year and int(row.pwea_month) == month:
			return float(row.pwea_expected or 0)
	return 0.0


def reset() -> None:
	reset_owned_data()
