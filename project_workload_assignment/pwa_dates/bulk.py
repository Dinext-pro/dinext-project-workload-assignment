"""PWA Bulk Process — API bulk create/update/delete + ToDo sync (prod parity)."""

from __future__ import annotations

import json

import frappe


def _get_task_subject(task):
	return frappe.db.get_value("Task", task, "subject") or task


def _current_pwa_users(task, items):
	users = set()
	for raw in items:
		if not isinstance(raw, dict):
			continue
		it = dict(raw)
		if it.get("task") != task:
			continue
		if bool(it.get("__isRemove", False)):
			continue
		u = it.get("user")
		if u:
			users.add(u)
	return users


def _current_todo_users(task):
	todos = frappe.get_all(
		"ToDo",
		filters={
			"reference_type": "Task",
			"reference_name": task,
			"status": ["!=", "Cancelled"],
		},
		fields=["name", "allocated_to", "status"],
	)
	return {t["allocated_to"] for t in todos if t.get("allocated_to")}


def _sync_assignments(task, items):
	if not task:
		return

	pwa_users = _current_pwa_users(task, items)
	todo_users = _current_todo_users(task)
	to_add = pwa_users - todo_users
	to_remove = todo_users - pwa_users
	desc = _get_task_subject(task)

	if to_add:
		# add_multiple expects a single args dict (or form_dict), not kwargs
		frappe.call(
			"frappe.desk.form.assign_to.add_multiple",
			{
				"assign_to": list(to_add),
				"doctype": "Task",
				"name": json.dumps([task]),
				"description": desc,
			},
		)

	for u in to_remove:
		frappe.call(
			"frappe.desk.form.assign_to.remove",
			doctype="Task",
			name=task,
			assign_to=u,
		)


@frappe.whitelist()
def bulk_process_pwa(rows=None):
	"""Массовая обработка PWA (create / update / delete) + sync ToDo assignees.

	Совместимо с SS API `bulk_process_pwa`: rows из form_dict или аргумента.
	"""
	payload = rows if rows is not None else frappe.form_dict.get("rows")
	items = json.loads(payload) if isinstance(payload, str) else payload
	if not items:
		return

	special_keys = {
		"__islocal",
		"__isRemove",
		"__tempname",
		"__islocal_doc",
		"_server_signature",
		"_comments",
		"_liked_by",
	}
	touched_tasks = set()

	for raw in items:
		item = dict(raw)
		name = item.get("name")
		is_remove = bool(item.pop("__isRemove", False))
		is_local = bool(item.pop("__islocal", False))
		touched_tasks.add(item.get("task"))

		if is_remove and is_local:
			continue

		if is_local:
			create_fields = {}
			for k, v in item.items():
				if k in special_keys or k == "name":
					continue
				create_fields[k] = v
			doc = frappe.get_doc({"doctype": "Project Workload Assignment", **create_fields})
			doc.insert(ignore_permissions=True)
			continue

		doc = frappe.get_doc("Project Workload Assignment", name)

		if is_remove:
			doc.delete()
			continue

		changed = False
		for k, v in item.items():
			if k in special_keys or k in ("doctype", "name"):
				continue
			doc.set(k, v)
			changed = True

		if changed:
			doc.save(ignore_permissions=True)

	for task in touched_tasks:
		_sync_assignments(task, items)
