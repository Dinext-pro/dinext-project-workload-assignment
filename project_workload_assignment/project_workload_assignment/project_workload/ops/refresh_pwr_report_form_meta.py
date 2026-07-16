# Copyright (c) 2026, Dinext
"""Сброс кэша FormMeta для PWR doctypes после изменения doctype_js / CSS hooks."""

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
		# custom DocType: FormMeta __js usually empty; UI via app_include.
		result["custom_doctype"] = bool(meta.get("custom"))
		result["note"] = "Form UI: pwr-form-boot.js → workload-reports"
	if doctype == "Project":
		result["has_workload_reports"] = "workload-reports" in js or "workloadReports" in js
		result["has_work_efforts"] = "work_efforts" in js or "we-v2" in js
	return result


def run(doctype: str | None = None):
	"""Refresh FormMeta cache for PWR forms. Default: both Report and Project."""
	targets = (doctype,) if doctype else PWR_FORM_DOCTYPES
	return [_refresh_doctype_form_meta(name) for name in targets]
