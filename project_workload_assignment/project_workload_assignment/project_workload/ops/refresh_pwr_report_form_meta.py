# Copyright (c) 2026, Dinext
"""Сброс кэша FormMeta для PWR doctypes после изменения doctype_js hooks."""

import frappe

PWR_FORM_DOCTYPES = ("Projects Workload Report", "Project")


def _refresh_doctype_form_meta(doctype: str) -> dict:
	frappe.cache.hdel("doctype_form_meta", doctype)
	frappe.clear_cache(doctype=doctype)
	frappe.db.set_value(
		"DocType",
		doctype,
		"modified",
		frappe.utils.now_datetime(),
		update_modified=False,
	)
	frappe.db.commit()

	from frappe.desk.form.meta import get_meta

	meta = get_meta(doctype, cached=False)
	js = meta.get("__js") or ""
	result = {
		"doctype": doctype,
		"__js_len": len(js),
		"has_api_methods": "PROJECT_TREE" in js and "pwrApi" in js,
	}
	if doctype == "Projects Workload Report":
		result["has_render"] = "render_projects_workload_table" in js
		result["has_form_registered"] = "form.js registered" in js
	if doctype == "Project":
		result["has_project_workload"] = "get_project_workload_data" in js
	return result


def run(doctype: str | None = None):
	"""Refresh FormMeta cache for PWR forms. Default: both Report and Project."""
	targets = (doctype,) if doctype else PWR_FORM_DOCTYPES
	return [_refresh_doctype_form_meta(name) for name in targets]
