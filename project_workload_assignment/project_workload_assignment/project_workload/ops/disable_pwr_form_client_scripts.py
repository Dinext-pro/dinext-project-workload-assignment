# Copyright (c) 2026, Dinext
"""Disable all Client Scripts on Projects Workload Report Form.

Form UI is app_include pwr-form-boot.js + workload-reports only — no CS.
"""

from __future__ import annotations

import frappe

DOCTYPE = "Projects Workload Report"


def run():
	names = frappe.get_all(
		"Client Script",
		filters={"dt": DOCTYPE},
		pluck="name",
	)
	disabled = []
	for name in names:
		if not frappe.db.get_value("Client Script", name, "enabled"):
			continue
		frappe.db.set_value("Client Script", name, "enabled", 0, update_modified=True)
		disabled.append(name)

	frappe.db.commit()
	frappe.cache.hdel("doctype_form_meta", DOCTYPE)
	frappe.clear_cache(doctype=DOCTYPE)

	return {
		"doctype": DOCTYPE,
		"disabled": disabled,
		"total": len(names),
	}
