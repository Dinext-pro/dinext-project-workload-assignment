"""Индексы БД для PWR (ISS-2026-00865). Создаются в after_install / after_migrate этого app."""

import frappe


# ISS-2026-00926: не дублировать в dinext_common; при migrate на сайте — bench migrate.
REPORT_INDEXES = (
	(
		"Project Workload Assignment",
		("task", "date_to", "date_from"),
		"idx_pwa_task_dates",
	),
	(
		"Project Workload Assignment",
		("user", "date_to", "date_from"),
		"idx_pwa_user_dates",
	),
	(
		"Project Work Efforts",
		("pwe_task", "pwe_project_role"),
		"idx_pwe_task_role",
	),
	(
		"Project Work Efforts",
		("pwe_project", "pwe_task", "pwe_project_role"),
		"idx_pwe_project_task_role",
	),
	(
		"Project Work Efforts Amount",
		("parent", "pwea_year", "pwea_month"),
		"idx_pwea_parent_year_month",
	),
	(
		"Worker",
		("wuser",),
		"idx_worker_wuser",
	),
)


def ensure_report_indexes():
	for doctype, fields, index_name in REPORT_INDEXES:
		frappe.db.add_index(doctype, fields, index_name)


def after_install():
	ensure_report_indexes()


def after_migrate():
	ensure_report_indexes()
