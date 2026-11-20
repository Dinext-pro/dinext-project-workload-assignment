"""PWA Bulk Process — API bulk create/update/delete + ToDo sync (prod parity)."""

from __future__ import annotations

import json
from contextlib import contextmanager
from uuid import uuid4

import frappe

from project_workload_assignment.pwa_dates.validation import collect_warnings


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


@contextmanager
def _atomic_batch():
	# ToDo changes schedule notifications. Drop these callbacks together with the
	# documents if a Python caller catches the error and continues its transaction.
	key = f"pwa_{uuid4().hex}"
	managers = (
		frappe.db.before_commit,
		frappe.db.after_commit,
		frappe.db.before_rollback,
		frappe.db.after_rollback,
	)
	callbacks = [(manager, tuple(manager._functions)) for manager in managers]
	queues = {}
	for attr in ("_realtime_log", "_webhook_queue"):
		queue = getattr(frappe.local, attr, None)
		queues[attr] = (queue, len(queue or ()))
	frappe.db.savepoint(key)
	try:
		yield
	except Exception:
		frappe.db.rollback(save_point=key)
		for manager, previous in callbacks:
			manager.reset()
			for callback in previous:
				manager.add(callback)
		for attr, (queue, length) in queues.items():
			if queue is not None:
				del queue[length:]
				setattr(frappe.local, attr, queue)
			elif hasattr(frappe.local, attr):
				delattr(frappe.local, attr)
		raise
	finally:
		frappe.db.release_savepoint(key)


@frappe.whitelist()
def bulk_process_pwa(rows=None):
	"""Apply dialog rows and sync ToDos in the caller's transaction."""
	payload = rows if rows is not None else frappe.form_dict.get("rows")
	items = json.loads(payload) if isinstance(payload, str) else payload
	if not items:
		return

	with _atomic_batch():
		with collect_warnings() as pending:
			touched_tasks = _apply_rows(items, pending)
			for task in touched_tasks:
				_sync_assignments(task, items)


def _apply_rows(items, pending):
	meta = frappe.get_meta("Project Workload Assignment")
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
				if not meta.has_field(k):
					continue
				create_fields[k] = v
			doc = frappe.get_doc({"doctype": "Project Workload Assignment", **create_fields})
			doc.insert(ignore_permissions=True)
			continue

		doc = frappe.get_doc("Project Workload Assignment", name)

		if is_remove:
			pending.pop(name, None)
			doc.delete()
			continue

		changed = False
		for k, v in item.items():
			if not meta.has_field(k):
				continue
			doc.set(k, v)
			changed = True

		if changed:
			doc.save(ignore_permissions=True)

	return touched_tasks
