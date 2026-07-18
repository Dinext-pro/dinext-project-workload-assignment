# Copyright (c) 2026, Dinext
"""Baseline regression: PWR Server Scripts check_workload_overload и update_forecast_from_assignments."""

from __future__ import annotations

import json
from pathlib import Path

import frappe
from frappe.tests.utils import FrappeTestCase

from .capture_golden_pwr import _normalize_overload_item, build_tc01_golden_payload
from .data_setup_pwr import (
	DEPENDENCY_PROJECT,
	TC01_PERIODS,
	TC01_VIEW_OPTIONS,
	call_check_workload_overload,
	call_update_forecast_from_assignments,
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
		raw = call_check_workload_overload(
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
		result = call_update_forecast_from_assignments(
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


def reset():
	reset_owned_data()
