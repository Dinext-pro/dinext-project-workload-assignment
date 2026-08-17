# Copyright (c) 2026, Dinext
"""Baseline регрессии Server Script Work Efforts: consolidated data, limits, save forecast."""

from __future__ import annotations

import json
from pathlib import Path

import frappe
from frappe.tests.utils import FrappeTestCase

from .data_setup import (
	BUSINESS_USER,
	DEPENDENCY_PROJECT,
	LIMITS_TIMESHEET_NAME,
	build_limits_positions_payload,
	dependency_project_available,
	get_pwe_plan,
	prepare_case_save_forecast_as_plan,
	reset_owned_data,
	server_script_available,
)


def _call_server_script_api(api_method: str, fd: dict):
	"""Точка входа API Server Script через frappe.call + form_dict (как HTTP POST)."""
	prev = getattr(frappe.local, "form_dict", None)
	frappe.local.form_dict = frappe._dict(fd)
	try:
		return frappe.call(api_method)
	finally:
		frappe.local.form_dict = prev


def _round_num(value) -> float | int | None:
	if value is None:
		return None
	if isinstance(value, bool):
		return value
	if isinstance(value, int):
		return value
	try:
		return round(float(value), 2)
	except (TypeError, ValueError):
		return value


def _normalize_role_entry(entry: dict) -> dict:
	out = {"role": entry.get("role")}
	for key in sorted(entry.keys()):
		if key == "role":
			continue
		if key.startswith("fact_utps_"):
			continue
		value = entry[key]
		if key.startswith(("plan_", "forecast_", "fact_")):
			out[key] = _round_num(value)
		else:
			out[key] = value
	return out


def normalize_consolidated_tasks(tasks: list) -> dict:
	rows = []
	for task in sorted(tasks or [], key=lambda item: item.get("value") or ""):
		role_data = [
			_normalize_role_entry(role_entry)
			for role_entry in sorted(
				task.get("role_data") or [],
				key=lambda item: item.get("role") or "",
			)
		]
		rows.append(
			{
				"value": task.get("value"),
				"subject": task.get("subject"),
				"indent": task.get("indent"),
				"expandable": task.get("expandable"),
				"parent_task": task.get("parent_task"),
				"type": task.get("type"),
				"status": task.get("status"),
				"role_data": role_data,
			}
		)
	return {
		"task_count": len(rows),
		"tasks_with_role_data": sum(1 for row in rows if row.get("role_data")),
		"tasks": rows,
	}


def _normalize_limits_hours_data(hours_data: dict | None) -> dict:
	hours_data = hours_data or {}
	out = {"total": _round_num(hours_data.get("total"))}
	for key, value in sorted(hours_data.items()):
		if key in ("total", "users", "user_hours"):
			continue
		out[key] = _round_num(value)
	users = hours_data.get("users")
	if isinstance(users, (list, set, tuple)):
		out["users"] = sorted(str(item) for item in users if item)
	return out


def normalize_limits_results(results: list) -> list:
	rows = []
	for item in results or []:
		rows.append(
			{
				"project": item.get("project"),
				"position": item.get("position"),
				"document_name": item.get("document_name"),
				"role": item.get("role"),
				"planned_hours": _round_num(item.get("planned_hours")),
				"total_hours": _round_num(item.get("total_hours")),
				"hours_data": _normalize_limits_hours_data(item.get("hours_data")),
				"completion_percentage": int(item.get("completion_percentage") or 0),
				"status": item.get("status"),
				"limit": _round_num(item.get("limit")),
				"used_parent_for_plan": bool(item.get("used_parent_for_plan")),
				"used_children_for_actual": bool(item.get("used_children_for_actual")),
				"child_tasks_count": int(item.get("child_tasks_count") or 0),
				"task_subject": item.get("task_subject"),
				"plan_required": bool(item.get("plan_required")),
				"plan_task_subject": item.get("plan_task_subject"),
			}
		)
	rows.sort(key=lambda row: (row.get("document_name") or "", row.get("role") or ""))
	return rows


class TestWeSsMigrationBaseline(FrappeTestCase):
	def tearDown(self):
		reset_owned_data()
		super().tearDown()

	def test_tc01_get_work_efforts_consolidated_data_golden(self):
		"""TC-01: golden-сравнение get_work_efforts_consolidated_data для TEST-V15.106.0 (HEAD)."""
		if not dependency_project_available():
			self.skipTest(f"Dependency project {DEPENDENCY_PROJECT!r} не найден на сайте")
		if not server_script_available("get_work_efforts_consolidated_data"):
			self.skipTest("Server Script get_work_efforts_consolidated_data не активен")

		fixture_path = Path(__file__).resolve().parent / "fixtures" / "tc01_consolidated_golden.json"
		if not fixture_path.exists():
			self.skipTest(f"Golden fixture не найден: {fixture_path.name} (запустите capture_golden.py)")

		with open(fixture_path, encoding="utf-8") as f:
			golden = json.load(f)
		golden.pop("_comment", None)
		request = golden["request"]
		expected = golden["response"]
		delta = float(golden.get("float_delta", 0.01))

		frappe.set_user(BUSINESS_USER)
		raw = _call_server_script_api(
			"get_work_efforts_consolidated_data",
			{
				"project": request["project"],
				"view_options": request.get("view_options", "Прогноз и факт"),
			},
		)
		self.assertIsInstance(raw, list, msg=f"Unexpected response type: {type(raw)}")

		actual = normalize_consolidated_tasks(raw)
		self.assertEqual(actual["task_count"], expected["task_count"])
		self.assertEqual(actual["tasks_with_role_data"], expected["tasks_with_role_data"])
		self.assertEqual(len(actual["tasks"]), len(expected["tasks"]))

		for idx, exp_task in enumerate(expected["tasks"]):
			act_task = actual["tasks"][idx]
			self.assertEqual(act_task["value"], exp_task["value"])
			self.assertEqual(act_task["indent"], exp_task["indent"])
			self.assertEqual(act_task["parent_task"], exp_task["parent_task"])
			self.assertEqual(len(act_task["role_data"]), len(exp_task["role_data"]))
			for ridx, exp_role in enumerate(exp_task["role_data"]):
				act_role = act_task["role_data"][ridx]
				self.assertEqual(act_role["role"], exp_role["role"])
				for key, exp_value in exp_role.items():
					if key == "role":
						continue
					act_value = act_role.get(key)
					if isinstance(exp_value, (int, float)):
						self.assertAlmostEqual(float(act_value or 0), float(exp_value), delta=delta)
					else:
						self.assertEqual(act_value, exp_value)

	def test_tc02_calculate_timesheet_limits_golden(self):
		"""TC-02: calculate_timesheet_limits — constructed positions vs golden на dependency-проекте."""
		if not dependency_project_available():
			self.skipTest(f"Dependency project {DEPENDENCY_PROJECT!r} не найден на сайте")
		if not frappe.db.exists("Task", "TASK-2026-00137"):
			self.skipTest("Dependency task TASK-2026-00137 не найден")
		if not server_script_available("calculate_timesheet_limits"):
			self.skipTest("Server Script calculate_timesheet_limits не активен")

		fixture_path = Path(__file__).resolve().parent / "fixtures" / "tc02_limits_golden.json"
		if not fixture_path.exists():
			self.skipTest(f"Golden fixture не найден: {fixture_path.name} (запустите capture_golden.py)")

		with open(fixture_path, encoding="utf-8") as f:
			golden = json.load(f)
		golden.pop("_comment", None)
		request = golden["request"]
		expected = golden["response"]
		delta = float(golden.get("float_delta", 0.01))

		positions = build_limits_positions_payload()
		frappe.set_user(BUSINESS_USER)
		raw = _call_server_script_api(
			"calculate_timesheet_limits",
			{
				"positions": json.dumps(positions, ensure_ascii=False),
				"timesheet_name": request.get("timesheet_name", LIMITS_TIMESHEET_NAME),
			},
		)
		self.assertIsInstance(raw, list, msg=f"Unexpected response type: {type(raw)}")

		actual = normalize_limits_results(raw)
		self.assertEqual(len(actual), len(expected))
		for idx, exp_item in enumerate(expected):
			act_item = actual[idx]
			self.assertEqual(act_item["document_name"], exp_item["document_name"])
			self.assertEqual(act_item["role"], exp_item["role"])
			self.assertEqual(act_item["status"], exp_item["status"])
			self.assertEqual(act_item["completion_percentage"], exp_item["completion_percentage"])
			self.assertAlmostEqual(
				float(act_item["planned_hours"] or 0),
				float(exp_item["planned_hours"] or 0),
				delta=delta,
			)
			self.assertAlmostEqual(
				float(act_item["total_hours"] or 0),
				float(exp_item["total_hours"] or 0),
				delta=delta,
			)
			self.assertEqual(
				act_item["used_children_for_actual"],
				exp_item["used_children_for_actual"],
			)
			self.assertEqual(act_item["child_tasks_count"], exp_item["child_tasks_count"])

	def test_tc03_save_forecast_as_plan_owned_data(self):
		"""TC-03: save_forecast_as_plan записывает plan в owned PWE."""
		if not server_script_available("save_forecast_as_plan"):
			self.skipTest("Server Script save_forecast_as_plan не активен")

		try:
			ctx = prepare_case_save_forecast_as_plan()
		except Exception as exc:
			self.skipTest(str(exc))

		project = ctx["project"]
		task = ctx["task"]
		role = ctx["role"]
		pwe = ctx["pwe"]
		fiscal_year = ctx["fiscal_year"]
		year = int(ctx["year"])
		month = int(ctx["month"])
		new_plan = float(ctx["new_plan"])

		before = get_pwe_plan(pwe, fiscal_year, month)
		self.assertAlmostEqual(before, float(ctx["initial_plan"]), delta=0.01)

		payload = [
			{
				"task": task,
				"role": role,
				"year": year,
				"month": month,
				"plan_value": new_plan,
			}
		]
		frappe.set_user(BUSINESS_USER)
		_call_server_script_api(
			"save_forecast_as_plan",
			{
				"project": project,
				"data": json.dumps(payload, ensure_ascii=False),
			},
		)

		after = get_pwe_plan(pwe, fiscal_year, month)
		self.assertAlmostEqual(after, new_plan, delta=0.01)
		self.assertNotAlmostEqual(after, before, delta=0.01)


def reset():
	reset_owned_data()
