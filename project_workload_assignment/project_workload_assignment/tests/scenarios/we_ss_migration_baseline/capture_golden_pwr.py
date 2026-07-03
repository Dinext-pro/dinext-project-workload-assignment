#!/usr/bin/env python3
"""Capture golden JSON for WE PWR Server Script migration baseline (TC-01).

Writes fixtures/tc01_check_workload_overload_golden.json under the scenario folder.
Run from host (via Docker backend):

  docker exec dinext-frappe-local-backend-1 bench --site dev.dinext.localhost execute \\
    project_workload_assignment.project_workload_assignment.tests.scenarios.we_ss_migration_baseline.capture_golden_pwr.capture_tc01_golden
"""
from __future__ import annotations

import json
from pathlib import Path

import frappe

DEPENDENCY_PROJECT = "TEST-V15.106.0 (HEAD)"
DEFAULT_PERIODS = [
	{"year": 2026, "month": m, "is_past": False}
	for m in range(6, 13)
]
DEFAULT_VIEW_OPTIONS = "Прогноз и факт"


def _call_check_workload_overload(project: str, periods: list, view_options: str) -> dict:
	prev = getattr(frappe.local, "form_dict", None)
	frappe.local.form_dict = frappe._dict(
		{
			"project": project,
			"periods": periods,
			"view_options": view_options,
		}
	)
	try:
		scripts = frappe.get_all(
			"Server Script",
			filters={"api_method": "check_workload_overload", "disabled": 0},
			pluck="name",
			limit=1,
		)
		if not scripts:
			frappe.throw("Active Server Script check_workload_overload not found")
		frappe.get_doc("Server Script", scripts[0]).execute_method()
		return dict(frappe.response.get("message") or {})
	finally:
		frappe.local.form_dict = prev


def _normalize_overload_item(item: dict) -> dict:
	"""Stable subset for golden comparison (ignore volatile user display names)."""
	months = []
	for m in item.get("months") or []:
		users = []
		for u in m.get("users") or []:
			users.append(
				{
					"user": u.get("user"),
					"assigned": round(float(u.get("assigned") or 0), 2),
				}
			)
		users.sort(key=lambda x: x.get("user") or "")
		months.append(
			{
				"year": int(m.get("year")),
				"month": int(m.get("month")),
				"forecast_hours": round(float(m.get("forecast_hours") or 0), 2),
				"assigned_hours": round(float(m.get("assigned_hours") or 0), 2),
				"users": users,
			}
		)
	months.sort(key=lambda x: (x["year"], x["month"]))
	return {
		"task": item.get("task"),
		"task_subject": item.get("task_subject"),
		"role": item.get("role"),
		"total_forecast": round(float(item.get("total_forecast") or 0), 2),
		"total_assigned": round(float(item.get("total_assigned") or 0), 2),
		"overload": round(float(item.get("overload") or 0), 2),
		"affected_users": int(item.get("affected_users") or 0),
		"months": months,
	}


def build_tc01_golden_payload(
	project: str = DEPENDENCY_PROJECT,
	periods: list | None = None,
	view_options: str = DEFAULT_VIEW_OPTIONS,
) -> dict:
	if not frappe.db.exists("Project", project):
		frappe.throw(f"Dependency project {project!r} not found on site")
	periods = periods if periods is not None else list(DEFAULT_PERIODS)
	raw = _call_check_workload_overload(project, periods, view_options)
	overloads = [_normalize_overload_item(o) for o in raw.get("overloads") or []]
	overloads.sort(key=lambda x: (x.get("task") or "", x.get("role") or ""))
	return {
		"_comment": (
			"WE-SS-MIG-PWR TC-01: golden ответ Server Script check_workload_overload "
			f"на dependency project {project}. Обновлять через capture_golden_pwr.py "
			"только при намеренном изменении контракта."
		),
		"project": project,
		"view_options": view_options,
		"periods": periods,
		"total_overloads": int(raw.get("total_overloads") or 0),
		"affected_tasks": int(raw.get("affected_tasks") or 0),
		"affected_users": int(raw.get("affected_users") or 0),
		"overloads": overloads,
	}


def capture_tc01_golden(
	project: str = DEPENDENCY_PROJECT,
	output_path: str | None = None,
) -> str:
	frappe.set_user("Administrator")
	payload = build_tc01_golden_payload(project=project)
	if output_path:
		out = Path(output_path)
	else:
		out = Path(__file__).resolve().parent / "fixtures" / "tc01_check_workload_overload_golden.json"
	out.parent.mkdir(parents=True, exist_ok=True)
	out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
	return str(out)
