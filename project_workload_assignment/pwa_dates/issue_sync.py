"""Issue dates update PWA — Issue After Save fallback без virtual Task (prod parity)."""

from __future__ import annotations

import frappe


def sync_issue_dates_to_pwa(doc, method=None) -> None:
	"""Если нет virtual Task — копировать opening/expected Issue в PWA связанных Task."""
	old_doc = doc.get_doc_before_save()
	virtual_task = frappe.db.get_value("Task", {"custom_linked_issue": doc.name}, "name")

	if virtual_task or not old_doc:
		return

	new_start = doc.get("opening_date")
	new_end = doc.get("custom_expected_resolution_date")
	old_start = old_doc.get("opening_date")
	old_end = old_doc.get("custom_expected_resolution_date")

	old_start_s = "" if old_start is None else str(old_start)
	new_start_s = "" if new_start is None else str(new_start)
	old_end_s = "" if old_end is None else str(old_end)
	new_end_s = "" if new_end is None else str(new_end)

	start_changed = old_start_s != new_start_s
	end_changed = old_end_s != new_end_s

	if not (start_changed or end_changed):
		return

	linked_tasks = frappe.get_all(
		"Task",
		filters={"issue": doc.name},
		fields=["name"],
		ignore_permissions=True,
	)

	for task_row in linked_tasks:
		task_name = task_row.get("name")
		if not task_name:
			continue

		pwa_rows = frappe.get_all(
			"Project Workload Assignment",
			filters={"task": task_name, "task_dates": 1},
			fields=["name"],
			ignore_permissions=True,
		)

		for row in pwa_rows:
			pwa_name = row.get("name")
			if not pwa_name:
				continue

			pwa_doc = frappe.get_doc(
				"Project Workload Assignment", pwa_name, ignore_permissions=True
			)
			changed = False

			pwa_start_s = "" if pwa_doc.date_from is None else str(pwa_doc.date_from)
			pwa_end_s = "" if pwa_doc.date_to is None else str(pwa_doc.date_to)

			if start_changed and pwa_start_s != new_start_s:
				pwa_doc.date_from = new_start
				changed = True

			if end_changed and pwa_end_s != new_end_s:
				pwa_doc.date_to = new_end
				changed = True

			if changed:
				pwa_doc.save(ignore_permissions=True)
