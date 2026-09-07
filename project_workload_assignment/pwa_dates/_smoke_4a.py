"""Live smoke layer 4a on current site (SS off + app hooks).

bench --site dev.dinext.localhost execute \\
  project_workload_assignment.pwa_dates._smoke_4a.run
"""

from __future__ import annotations

import frappe
from frappe.utils import getdate

from project_workload_assignment.pwa_dates.bulk import bulk_process_pwa

PROJECT = "TEST-V15.106.0 (HEAD)"
PREFIX = "TEST ISS-2026-03288 PWA4a"
SS_NAMES = (
	"Task dates update  PWA",
	"Issue dates update PWA",
	"PWA Bulk Process",
)


def _line(ok, name, detail=""):
	return f"{'PASS' if ok else 'FAIL'}\t{name}" + (f"\t{detail}" if detail else "")


def _user():
	user = frappe.session.user
	return "Administrator" if user == "Guest" else user


def _make_task(**kwargs):
	data = {
		"doctype": "Task",
		"project": PROJECT,
		"type": "Stage",
		"status": "Open",
	}
	data.update(kwargs)
	return frappe.get_doc(data).insert(ignore_permissions=True)


def _make_pwa(task_name, *, task_dates=1, date_from="2026-07-01", date_to="2026-07-05"):
	return frappe.get_doc(
		{
			"doctype": "Project Workload Assignment",
			"task": task_name,
			"user": _user(),
			"role": "Консультант",
			"wl_value": 10,
			"task_dates": task_dates,
			"date_from": date_from,
			"date_to": date_to,
		}
	).insert(ignore_permissions=True)


def tc_ss_disabled():
	bad = []
	for n in SS_NAMES:
		if frappe.db.exists("Server Script", n) and not frappe.db.get_value(
			"Server Script", n, "disabled"
		):
			bad.append(n)
	return _line(not bad, "TC0 SS disabled", ",".join(bad) if bad else "ok")


def tc_task_sync():
	task = _make_task(
		subject=f"{PREFIX} task sync",
		exp_start_date="2026-08-01",
		exp_end_date="2026-08-10",
	)
	pwa = _make_pwa(task.name)
	frappe.db.commit()

	task.reload()
	task.exp_start_date = "2026-08-05"
	task.exp_end_date = "2026-08-20"
	task.save(ignore_permissions=True)
	frappe.db.commit()

	row = frappe.db.get_value(
		"Project Workload Assignment", pwa.name, ["date_from", "date_to"], as_dict=True
	)
	ok = getdate(row.date_from) == getdate("2026-08-05") and getdate(row.date_to) == getdate(
		"2026-08-20"
	)
	return _line(ok, "TC1 Task→PWA", f"{task.name}/{pwa.name} {row.date_from}..{row.date_to}")


def tc_task_dates_off_untouched():
	task = _make_task(
		subject=f"{PREFIX} no flag",
		exp_start_date="2026-08-01",
		exp_end_date="2026-08-10",
	)
	pwa = _make_pwa(task.name, task_dates=0, date_from="2026-07-01", date_to="2026-07-05")
	frappe.db.commit()

	task.reload()
	task.exp_start_date = "2026-09-01"
	task.exp_end_date = "2026-09-15"
	task.save(ignore_permissions=True)
	frappe.db.commit()

	row = frappe.db.get_value(
		"Project Workload Assignment", pwa.name, ["date_from", "date_to"], as_dict=True
	)
	ok = getdate(row.date_from) == getdate("2026-07-01") and getdate(row.date_to) == getdate(
		"2026-07-05"
	)
	return _line(ok, "TC2 task_dates=0 skip", f"{pwa.name} still {row.date_from}..{row.date_to}")


def tc_issue_fallback():
	"""Issue without virtual → PWA on Task.issue=Issue."""
	# Use issue_type without virtual if possible; else plain Issue + no custom_linked_issue Task.
	issue = frappe.get_doc(
		{
			"doctype": "Issue",
			"subject": f"{PREFIX} issue fallback",
			"project": PROJECT,
			"issue_type": "Инцидент",
			"status": "Open",
			"opening_date": "2026-07-01",
			"custom_expected_resolution_date": "2026-07-10",
		}
	).insert(ignore_permissions=True)
	frappe.db.commit()

	# Guard: if virtual appeared (settings), skip with note
	vt = frappe.db.get_value("Task", {"custom_linked_issue": issue.name}, "name")
	if vt:
		return _line(True, "TC3 Issue→PWA skip", f"virtual exists {vt} (guard path)")

	task = _make_task(
		subject=f"{PREFIX} linked ordinary",
		issue=issue.name,
		exp_start_date="2026-07-01",
		exp_end_date="2026-07-10",
	)
	pwa = _make_pwa(task.name, date_from="2026-06-01", date_to="2026-06-05")
	frappe.db.commit()

	issue.reload()
	issue.opening_date = "2026-08-01"
	issue.custom_expected_resolution_date = "2026-08-25"
	issue.save(ignore_permissions=True)
	frappe.db.commit()

	row = frappe.db.get_value(
		"Project Workload Assignment", pwa.name, ["date_from", "date_to"], as_dict=True
	)
	ok = getdate(row.date_from) == getdate("2026-08-01") and getdate(row.date_to) == getdate(
		"2026-08-25"
	)
	return _line(ok, "TC3 Issue→PWA", f"{issue.name}/{pwa.name} {row.date_from}..{row.date_to}")


def tc_bulk_create():
	task = _make_task(subject=f"{PREFIX} bulk")
	frappe.db.commit()
	rows = [
		{
			"__islocal": True,
			"task": task.name,
			"user": _user(),
			"role": "Консультант",
			"wl_value": 5,
			"task_dates": 1,
			"date_from": "2026-08-01",
			"date_to": "2026-08-07",
		}
	]
	bulk_process_pwa(rows)
	frappe.db.commit()
	exists = frappe.db.exists(
		"Project Workload Assignment",
		{"task": task.name, "user": _user(), "task_dates": 1},
	)
	return _line(bool(exists), "TC4 bulk create", f"task={task.name} pwa={exists}")


def run():
	print(f"=== PWA 4a smoke @ {frappe.local.site} ===")
	lines = []
	for fn in (
		tc_ss_disabled,
		tc_task_sync,
		tc_task_dates_off_untouched,
		tc_issue_fallback,
		tc_bulk_create,
	):
		try:
			line = fn()
		except Exception as e:
			line = _line(False, fn.__name__, f"{type(e).__name__}: {e}")
		print(line)
		lines.append(line)
	print("=== done ===")
	failed = [ln for ln in lines if ln.startswith("FAIL")]
	return "FAIL" if failed else "OK"
