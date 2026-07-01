# Copyright (c) 2026, Dinext
"""Baseline regression: PWR Server Scripts check_workload_overload и update_forecast_from_assignments."""

from __future__ import annotations

import json
from pathlib import Path

import frappe
from frappe.tests.utils import FrappeTestCase

from .capture_golden_pwr import _normalize_overload_item
from .data_setup import (
	ASSIGNED_HOURS,
	DEPENDENCY_PROJECT,
	FORECAST_MONTH,
	FORECAST_YEAR,
	INITIAL_FORECAST,
	TC01_PERIODS,
	TC01_VIEW_OPTIONS,
	call_check_workload_overload,
	call_check_workload_overload_python,
	call_update_forecast_from_assignments,
	call_update_forecast_from_assignments_python,
	get_pwe_expected_by_fy_month,
	prepare_case_update_forecast_from_assignments,
	reset_owned_data,
)


def _normalize_actual_payload(raw: dict, project: str, periods: list, view_options: str) -> dict:
	overloads = [_normalize_overload_item(o) for o in raw.get("overloads") or []]
	overloads.sort(key=lambda x: (x.get("task") or "", x.get("role") or ""))
	return {
		"project": project,
		"view_options": view_options,
		"periods": periods,
		"total_overloads": int(raw.get("total_overloads") or 0),
		"affected_tasks": int(raw.get("affected_tasks") or 0),
		"affected_users": int(raw.get("affected_users") or 0),
		"overloads": overloads,
	}


class TestWEPwrSsMigrationBaseline(FrappeTestCase):
	def tearDown(self):
		reset_owned_data()
		super().tearDown()

	def test_tc01_check_workload_overload_golden(self):
		"""TC-01: golden comparison check_workload_overload на dependency project TEST-V15.106.0 (HEAD)."""
		if not frappe.db.exists("Project", DEPENDENCY_PROJECT):
			self.skipTest(f"Dependency project {DEPENDENCY_PROJECT!r} отсутствует на сайте")

		fixture_path = (
			Path(__file__).resolve().parent / "fixtures" / "tc01_check_workload_overload_golden.json"
		)
		if not fixture_path.is_file():
			self.skipTest(
				"Нет fixtures/tc01_check_workload_overload_golden.json — "
				"запустите capture_golden_pwr.py"
			)

		with open(fixture_path, encoding="utf-8") as f:
			golden = json.load(f)
		golden.pop("_comment", None)

		frappe.set_user("Administrator")
		raw = call_check_workload_overload_python(
			DEPENDENCY_PROJECT,
			TC01_PERIODS,
			TC01_VIEW_OPTIONS,
		)
		self.assertNotIn("error", raw, msg=raw.get("error"))
		actual = _normalize_actual_payload(
			raw,
			DEPENDENCY_PROJECT,
			TC01_PERIODS,
			TC01_VIEW_OPTIONS,
		)

		self.assertEqual(actual["total_overloads"], golden["total_overloads"])
		self.assertEqual(actual["affected_tasks"], golden["affected_tasks"])
		self.assertEqual(actual["affected_users"], golden["affected_users"])
		self.assertEqual(len(actual["overloads"]), len(golden["overloads"]))

		for idx, (act, exp) in enumerate(zip(actual["overloads"], golden["overloads"])):
			self.assertEqual(act["task"], exp["task"], msg=f"overload[{idx}].task")
			self.assertEqual(act["role"], exp["role"], msg=f"overload[{idx}].role")
			self.assertAlmostEqual(
				act["total_forecast"],
				float(exp["total_forecast"]),
				delta=0.05,
				msg=f"overload[{idx}].total_forecast",
			)
			self.assertAlmostEqual(
				act["total_assigned"],
				float(exp["total_assigned"]),
				delta=0.05,
				msg=f"overload[{idx}].total_assigned",
			)
			self.assertAlmostEqual(
				act["overload"],
				float(exp["overload"]),
				delta=0.05,
				msg=f"overload[{idx}].overload",
			)
			self.assertEqual(act["affected_users"], exp["affected_users"])
			self.assertEqual(len(act["months"]), len(exp["months"]))
			for midx, (am, em) in enumerate(zip(act["months"], exp["months"])):
				self.assertEqual(am["year"], em["year"])
				self.assertEqual(am["month"], em["month"])
				self.assertAlmostEqual(am["forecast_hours"], float(em["forecast_hours"]), delta=0.05)
				self.assertAlmostEqual(am["assigned_hours"], float(em["assigned_hours"]), delta=0.05)
				if em.get("users"):
					self.assertEqual(len(am.get("users") or []), len(em["users"]))
					for uidx, (au, eu) in enumerate(zip(am["users"], em["users"])):
						self.assertEqual(au["user"], eu["user"], msg=f"overload[{idx}].months[{midx}].users[{uidx}]")
						self.assertAlmostEqual(au["assigned"], float(eu["assigned"]), delta=0.05)

	def test_tc02_update_forecast_from_assignments_owned_pwa_pwe(self):
		"""TC-02: update_forecast_from_assignments обновляет pwea_expected только на owned данных."""
		if not frappe.db.exists("DocType", "Project Work Efforts"):
			self.skipTest("DocType Project Work Efforts не установлен")

		ctx = prepare_case_update_forecast_from_assignments()
		project = ctx["project"]
		task = ctx["task"]
		role = ctx["role"]
		pwe = ctx["pwe"]
		fiscal_year = ctx["fiscal_year"]
		assigned = float(ctx["assigned_hours"])
		year = int(ctx["year"])
		month = int(ctx["month"])

		before = get_pwe_expected_by_fy_month(pwe, fiscal_year, month)
		self.assertAlmostEqual(before, float(ctx["initial_forecast"]), delta=0.01)

		frappe.set_user("Administrator")
		result = call_update_forecast_from_assignments_python(
			project,
			[
				{
					"task": task,
					"role": role,
					"year": year,
					"month": month,
					"assigned_hours": assigned,
				}
			],
		)

		self.assertTrue(result.get("success"), msg=result.get("error") or result)
		self.assertEqual(int(result.get("updated_count") or 0), 1)

		after = get_pwe_expected_by_fy_month(pwe, fiscal_year, month)
		self.assertAlmostEqual(after, assigned, delta=0.01, msg="pwea_expected должен стать assigned_hours")


	def test_tc03_check_workload_overload_python_matches_ss(self):
		"""TC-03: dual-mode — Python module produce same result as SS for check_workload_overload."""
		if not frappe.db.exists("Project", DEPENDENCY_PROJECT):
			self.skipTest(f"Dependency project {DEPENDENCY_PROJECT!r} отсутствует на сайте")

		active_scripts = frappe.get_all(
			"Server Script",
			filters={"api_method": "check_workload_overload", "disabled": 0},
			pluck="name",
			limit=1,
		)
		if not active_scripts:
			self.skipTest("Active SS check_workload_overload not found — SS path unavailable")

		frappe.set_user("Administrator")

		ss_raw = call_check_workload_overload(DEPENDENCY_PROJECT, TC01_PERIODS, TC01_VIEW_OPTIONS)
		py_raw = call_check_workload_overload_python(DEPENDENCY_PROJECT, TC01_PERIODS, TC01_VIEW_OPTIONS)

		self.assertNotIn("error", ss_raw, msg=ss_raw.get("error"))
		self.assertNotIn("error", py_raw, msg=py_raw.get("error"))

		ss_actual = _normalize_actual_payload(ss_raw, DEPENDENCY_PROJECT, TC01_PERIODS, TC01_VIEW_OPTIONS)
		py_actual = _normalize_actual_payload(py_raw, DEPENDENCY_PROJECT, TC01_PERIODS, TC01_VIEW_OPTIONS)

		self.assertEqual(py_actual["total_overloads"], ss_actual["total_overloads"], "total_overloads mismatch")
		self.assertEqual(py_actual["affected_tasks"], ss_actual["affected_tasks"], "affected_tasks mismatch")
		self.assertEqual(py_actual["affected_users"], ss_actual["affected_users"], "affected_users mismatch")
		self.assertEqual(len(py_actual["overloads"]), len(ss_actual["overloads"]), "overloads count mismatch")

		for idx, (py_o, ss_o) in enumerate(zip(py_actual["overloads"], ss_actual["overloads"])):
			self.assertEqual(py_o["task"], ss_o["task"], msg=f"overload[{idx}].task")
			self.assertEqual(py_o["role"], ss_o["role"], msg=f"overload[{idx}].role")
			self.assertAlmostEqual(py_o["total_forecast"], ss_o["total_forecast"], delta=0.05,
				msg=f"overload[{idx}].total_forecast")
			self.assertAlmostEqual(py_o["total_assigned"], ss_o["total_assigned"], delta=0.05,
				msg=f"overload[{idx}].total_assigned")
			self.assertAlmostEqual(py_o["overload"], ss_o["overload"], delta=0.05,
				msg=f"overload[{idx}].overload")
			self.assertEqual(py_o["affected_users"], ss_o["affected_users"],
				msg=f"overload[{idx}].affected_users")

	def test_tc04_update_forecast_python_matches_ss(self):
		"""TC-04: dual-mode — Python module update_forecast_from_assignments matches SS behaviour."""
		if not frappe.db.exists("DocType", "Project Work Efforts"):
			self.skipTest("DocType Project Work Efforts не установлен")

		active_scripts = frappe.get_all(
			"Server Script",
			filters={"api_method": "update_forecast_from_assignments", "disabled": 0},
			pluck="name",
			limit=1,
		)
		if not active_scripts:
			self.skipTest("Active SS update_forecast_from_assignments not found — SS path unavailable")

		frappe.set_user("Administrator")

		# --- SS path ---
		ctx = prepare_case_update_forecast_from_assignments()
		project = ctx["project"]
		task = ctx["task"]
		role = ctx["role"]
		pwe = ctx["pwe"]
		fiscal_year = ctx["fiscal_year"]
		assigned = float(ctx["assigned_hours"])
		year = int(ctx["year"])
		month = int(ctx["month"])

		ss_result = call_update_forecast_from_assignments(
			project,
			[{"task": task, "role": role, "year": year, "month": month, "assigned_hours": assigned}],
		)
		self.assertTrue(ss_result.get("success"), msg=f"SS failed: {ss_result}")
		ss_after = get_pwe_expected_by_fy_month(pwe, fiscal_year, month)

		# --- Python path (fresh owned data) ---
		ctx2 = prepare_case_update_forecast_from_assignments(
			assigned_hours=ASSIGNED_HOURS,
			initial_forecast=INITIAL_FORECAST,
		)
		project2 = ctx2["project"]
		task2 = ctx2["task"]
		role2 = ctx2["role"]
		pwe2 = ctx2["pwe"]
		fiscal_year2 = ctx2["fiscal_year"]
		assigned2 = float(ctx2["assigned_hours"])
		year2 = int(ctx2["year"])
		month2 = int(ctx2["month"])

		py_result = call_update_forecast_from_assignments_python(
			project2,
			[{"task": task2, "role": role2, "year": year2, "month": month2, "assigned_hours": assigned2}],
		)
		self.assertTrue(py_result.get("success"), msg=f"Python failed: {py_result}")
		py_after = get_pwe_expected_by_fy_month(pwe2, fiscal_year2, month2)

		# Both paths must write assigned_hours into pwea_expected
		self.assertAlmostEqual(ss_after, assigned, delta=0.01, msg="SS: pwea_expected должен стать assigned_hours")
		self.assertAlmostEqual(py_after, assigned2, delta=0.01, msg="Py: pwea_expected должен стать assigned_hours")
		self.assertEqual(py_result.get("updated_count"), ss_result.get("updated_count"),
			msg="updated_count mismatch between SS and Python paths")

	def test_tc05_check_workload_overload_python_standalone(self):
		"""TC-05: Python check_workload_overload работает без активного SS (standalone)."""
		if not frappe.db.exists("Project", DEPENDENCY_PROJECT):
			self.skipTest(f"Dependency project {DEPENDENCY_PROJECT!r} отсутствует на сайте")

		frappe.set_user("Administrator")
		raw = call_check_workload_overload_python(DEPENDENCY_PROJECT, TC01_PERIODS, TC01_VIEW_OPTIONS)

		self.assertIsInstance(raw, dict)
		self.assertNotIn("error", raw, msg=raw.get("error"))
		self.assertIn("overloads", raw)
		self.assertIn("total_overloads", raw)

	def test_tc06_update_forecast_python_standalone(self):
		"""TC-06: Python update_forecast_from_assignments работает без активного SS (standalone)."""
		if not frappe.db.exists("DocType", "Project Work Efforts"):
			self.skipTest("DocType Project Work Efforts не установлен")

		frappe.set_user("Administrator")
		ctx = prepare_case_update_forecast_from_assignments()

		before = get_pwe_expected_by_fy_month(ctx["pwe"], ctx["fiscal_year"], int(ctx["month"]))
		self.assertAlmostEqual(before, float(ctx["initial_forecast"]), delta=0.01)

		result = call_update_forecast_from_assignments_python(
			ctx["project"],
			[{
				"task": ctx["task"],
				"role": ctx["role"],
				"year": int(ctx["year"]),
				"month": int(ctx["month"]),
				"assigned_hours": float(ctx["assigned_hours"]),
			}],
		)

		self.assertTrue(result.get("success"), msg=result.get("error") or result)
		self.assertEqual(int(result.get("updated_count") or 0), 1)

		after = get_pwe_expected_by_fy_month(ctx["pwe"], ctx["fiscal_year"], int(ctx["month"]))
		self.assertAlmostEqual(after, float(ctx["assigned_hours"]), delta=0.01,
			msg="pwea_expected должен стать assigned_hours")


def reset():
	reset_owned_data()
