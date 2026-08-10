"""Live smoke layer 4a Task→PWA on current site."""

from __future__ import annotations

import frappe
from frappe.utils import getdate

PROJECT = "TEST-V15.106.0 (HEAD)"
PREFIX = "TEST ISS-2026-03288 PWA4a"


def run():
	# ensure SS off
	for n in ("Task dates update  PWA", "Issue dates update PWA", "PWA Bulk Process"):
		if frappe.db.exists("Server Script", n) and not frappe.db.get_value(
			"Server Script", n, "disabled"
		):
			return f"FAIL SS still enabled: {n}"

	user = frappe.session.user
	if user == "Guest":
		user = "Administrator"

	task = frappe.get_doc(
		{
			"doctype": "Task",
			"subject": f"{PREFIX} task",
			"project": PROJECT,
			"type": "Stage",
			"status": "Open",
			"exp_start_date": "2026-08-01",
			"exp_end_date": "2026-08-10",
		}
	).insert(ignore_permissions=True)

	pwa = frappe.get_doc(
		{
			"doctype": "Project Workload Assignment",
			"task": task.name,
			"user": user,
			"role": "Консультант",
			"wl_value": 10,
			"task_dates": 1,
			"date_from": "2026-07-01",
			"date_to": "2026-07-05",
		}
	).insert(ignore_permissions=True)
	frappe.db.commit()

	task.reload()
	task.exp_start_date = "2026-08-05"
	task.exp_end_date = "2026-08-20"
	task.save(ignore_permissions=True)
	frappe.db.commit()

	row = frappe.db.get_value(
		"Project Workload Assignment",
		pwa.name,
		["date_from", "date_to", "task_dates"],
		as_dict=True,
	)
	ok = getdate(row.date_from) == getdate("2026-08-05") and getdate(
		row.date_to
	) == getdate("2026-08-20")
	detail = f"task={task.name} pwa={pwa.name} dates={row.date_from}..{row.date_to}"
	return ("PASS " if ok else "FAIL ") + detail
