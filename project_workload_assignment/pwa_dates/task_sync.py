"""Task dates update PWA — Task After Save → PWA date_from/to (prod parity)."""

from __future__ import annotations

import frappe


def sync_task_dates_to_pwa(doc, method=None) -> None:
	"""Скопировать Task.exp_* в PWA с task_dates=1 при смене дат или force-флагах."""
	new_start = doc.get("exp_start_date")
	new_end = doc.get("exp_end_date")
	force_sync = bool(
		doc.flags.get("task_dates_force_pwa_sync")
		or doc.flags.get("task_actual_dates_parent_sync")
	)

	old_doc = doc.get_doc_before_save()

	if old_doc is None:
		start_changed = new_start is not None
		end_changed = new_end is not None
	else:
		old_start = old_doc.get("exp_start_date")
		old_end = old_doc.get("exp_end_date")
		old_start_s = "" if old_start is None else str(old_start)
		new_start_s = "" if new_start is None else str(new_start)
		old_end_s = "" if old_end is None else str(old_end)
		new_end_s = "" if new_end is None else str(new_end)
		start_changed = old_start_s != new_start_s
		end_changed = old_end_s != new_end_s

	if not (start_changed or end_changed or force_sync):
		return

	pwa_rows = frappe.get_all(
		"Project Workload Assignment",
		filters={"task": doc.name, "task_dates": 1},
		fields=["name"],
	)

	new_start_s = "" if new_start is None else str(new_start)
	new_end_s = "" if new_end is None else str(new_end)

	for row in pwa_rows:
		pwa_name = row.get("name")
		if not pwa_name:
			continue

		pwa_doc = frappe.get_doc("Project Workload Assignment", pwa_name, ignore_permissions=True)
		changed = False

		pwa_start_s = "" if pwa_doc.date_from is None else str(pwa_doc.date_from)
		pwa_end_s = "" if pwa_doc.date_to is None else str(pwa_doc.date_to)

		if (start_changed or force_sync) and pwa_start_s != new_start_s:
			pwa_doc.date_from = new_start
			changed = True

		if (end_changed or force_sync) and pwa_end_s != new_end_s:
			pwa_doc.date_to = new_end
			changed = True

		if changed:
			pwa_doc.save(ignore_permissions=True)
