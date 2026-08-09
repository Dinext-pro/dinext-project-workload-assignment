# Copyright (c) 2026, Dinext
"""Минимальный Worker-контекст для Administrator на чистом CI-сайте.

Сценарии PWR/utilization раньше клонировали поля с существующего Worker
Administrator. В ephemeral CI (`skip_test_records=true`) такой записи нет —
создаём её детерминированно вместе с Timesheet Template / User Group / Holiday List.
"""

from __future__ import annotations

import frappe

ADMIN_USER = "Administrator"
CI_USER_GROUP = "PWA-CI-Admin-UG"
CI_HOLIDAY_LIST = "PWA-CI-HL"
CI_TIMESHEET_TEMPLATE = "PWA-CI-Timesheet-Template"
CI_WORKING_HOURS_ON_DATE = "PWA-CI-Working-Hours-On-Date"
CI_VALID_FROM = "2020-01-01"


def ensure_admin_worker_context() -> dict:
	"""Гарантирует Worker для Administrator с заполненным wtimesheet_template.

	Returns:
		dict с ключами worker, wtimesheet_template, wuser_group, wholiday_list.
	"""
	if not frappe.db.exists("DocType", "Worker"):
		frappe.throw("DocType Worker не установлен — нужен dinext_timesheets")

	existing = frappe.db.get_value(
		"Worker",
		{"wuser": ADMIN_USER},
		["name", "wtimesheet_template", "wuser_group", "wholiday_list"],
		as_dict=True,
	)
	if existing and existing.get("wtimesheet_template"):
		# Не восстанавливаем wholiday_list: сценарии «без HL» намеренно обнуляют его.
		ug = existing.get("wuser_group") or _ensure_user_group()
		if not existing.get("wuser_group"):
			frappe.db.set_value("Worker", existing.name, "wuser_group", ug, update_modified=False)
		if not frappe.db.get_value("Worker", existing.name, "wvalid_from"):
			frappe.db.set_value(
				"Worker",
				existing.name,
				"wvalid_from",
				CI_VALID_FROM,
				update_modified=False,
			)
		return {
			"worker": existing.name,
			"wtimesheet_template": existing.wtimesheet_template,
			"wuser_group": ug,
			"wholiday_list": existing.get("wholiday_list"),
		}

	template = _ensure_timesheet_template()
	ug = _ensure_user_group()
	hl = _ensure_holiday_list()

	if existing:
		frappe.db.set_value(
			"Worker",
			existing.name,
			{
				"wtimesheet_template": template,
				"wuser_group": ug,
				"wholiday_list": hl,
				"wvalid_from": CI_VALID_FROM,
			},
			update_modified=False,
		)
		worker_name = existing.name
	else:
		doc = frappe.get_doc(
			{
				"doctype": "Worker",
				"wuser": ADMIN_USER,
				"wuser_group": ug,
				"wtimesheet_template": template,
				"wholiday_list": hl,
				"wvalid_from": CI_VALID_FROM,
			}
		)
		doc.insert(ignore_permissions=True, ignore_mandatory=True)
		worker_name = doc.name

	# Тип Employee нужен утилизационным сценариям (фильтр wtype).
	frappe.db.set_value("Worker", worker_name, "wtype", "Employee", update_modified=False)

	return {
		"worker": worker_name,
		"wtimesheet_template": template,
		"wuser_group": ug,
		"wholiday_list": hl,
	}


def _ensure_user_group() -> str:
	if frappe.db.exists("User Group", CI_USER_GROUP):
		return CI_USER_GROUP
	# Переиспользуем любую существующую группу, если есть (меньше мусора на стенде).
	existing = frappe.get_all("User Group", limit=1, pluck="name", ignore_permissions=True)
	if existing:
		return existing[0]
	doc = frappe.get_doc(
		{
			"doctype": "User Group",
			"name": CI_USER_GROUP,
			"user_group_members": [{"user": ADMIN_USER}],
		}
	)
	doc.insert(ignore_permissions=True, ignore_mandatory=True)
	return doc.name


def _ensure_holiday_list() -> str:
	existing = frappe.get_all("Holiday List", limit=1, pluck="name", ignore_permissions=True)
	if existing:
		return existing[0]
	if frappe.db.exists("Holiday List", CI_HOLIDAY_LIST):
		return CI_HOLIDAY_LIST
	company = None
	companies = frappe.get_all("Company", limit=1, pluck="name", ignore_permissions=True)
	if companies:
		company = companies[0]
	doc = frappe.get_doc(
		{
			"doctype": "Holiday List",
			"holiday_list_name": CI_HOLIDAY_LIST,
			"from_date": "2020-01-01",
			"to_date": "2030-12-31",
			"company": company,
		}
	)
	doc.insert(ignore_permissions=True, ignore_mandatory=True)
	return doc.name


def _ensure_timesheet_template() -> str:
	if not frappe.db.exists("DocType", "Timesheet Template"):
		frappe.throw("DocType Timesheet Template не установлен — нужен dinext_timesheets")

	existing = frappe.get_all(
		"Timesheet Template",
		limit=1,
		pluck="name",
		ignore_permissions=True,
	)
	if existing:
		return existing[0]
	if frappe.db.exists("Timesheet Template", CI_TIMESHEET_TEMPLATE):
		return CI_TIMESHEET_TEMPLATE

	wod = _ensure_working_hours_on_date()
	doc = frappe.get_doc(
		{
			"doctype": "Timesheet Template",
			"ttsubject": CI_TIMESHEET_TEMPLATE,
			"enabled": 1,
			"tt_working_hours_on_date": wod,
			"ttreporting_period": "Недельный",
			"hours_on_date": 8.0,
			"minimum_hours": 0.0,
			"maximum_hours": 8.0,
			"working_days": 1,
			"doctype_for_timesheet": [{"dtdoctype": "Task"}],
		}
	)
	doc.insert(ignore_permissions=True, ignore_mandatory=True)
	return doc.name


def _ensure_working_hours_on_date() -> str:
	if not frappe.db.exists("DocType", "Working Hours On Date"):
		frappe.throw(
			"DocType Working Hours On Date не установлен — нельзя создать Timesheet Template в CI"
		)
	existing = frappe.get_all(
		"Working Hours On Date",
		limit=1,
		pluck="name",
		ignore_permissions=True,
	)
	if existing:
		return existing[0]
	if frappe.db.exists("Working Hours On Date", CI_WORKING_HOURS_ON_DATE):
		return CI_WORKING_HOURS_ON_DATE
	doc = frappe.get_doc(
		{
			"doctype": "Working Hours On Date",
			"name": CI_WORKING_HOURS_ON_DATE,
			"hod_from_date": "2020-01-01",
			"hod_to_date": "2030-12-31",
			"hod_working_hours_table": [],
		}
	)
	doc.insert(ignore_permissions=True, ignore_mandatory=True)
	return doc.name
