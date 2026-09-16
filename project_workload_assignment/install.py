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


OWNED_PROJECT_TEAM_FIELDS = (
	"notifications_on_limits",
	"workload_limit",
)


def detach_owned_project_team_fields() -> None:
	"""Detach DocFields re-owned as Custom Fields before fixture sync.

	CI still pins dinext_projects releases that define these as DocFields.
	`after_install` runs before sync_fixtures, so delete_fields makes install idempotent.
	"""
	from frappe.model import delete_fields

	delete_fields({"Project Team Details": list(OWNED_PROJECT_TEAM_FIELDS)}, delete=0)
	frappe.clear_cache(doctype="Project Team Details")


def after_install():
	detach_owned_project_team_fields()
	ensure_report_indexes()


def after_migrate():
	ensure_report_indexes()
