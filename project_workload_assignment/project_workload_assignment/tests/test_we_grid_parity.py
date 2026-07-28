# Copyright (c) 2026, Dinext
"""Parity: WE grid v2 scalar rows vs legacy consolidated role_data."""

from __future__ import annotations

from frappe.tests.utils import FrappeTestCase

from project_workload_assignment.project_workload_assignment.work_efforts.consolidated_data import (
	run_get_work_efforts_consolidated_data,
)
from project_workload_assignment.project_workload_assignment.work_efforts.grid_data import (
	flatten_consolidated_tasks_to_v2_rows,
	run_get_work_efforts_grid,
)
from project_workload_assignment.project_workload_assignment.work_efforts.periods import (
	get_display_periods,
	normalize_view_mode,
)
from project_workload_assignment.project_workload_assignment.work_efforts.summary import (
	build_we_summary_rows,
	calc_we_column_total,
)
from project_workload_assignment.project_workload_assignment.tests.scenarios.we_ss_migration_baseline.data_setup import (
	DEPENDENCY_PROJECT,
	dependency_project_available,
)


def _round_num(value) -> float:
	try:
		return round(float(value or 0), 2)
	except (TypeError, ValueError):
		return 0.0


def _legacy_period_values(task: dict) -> dict[tuple[str, str, str], float]:
	"""{(task_id, role, field_prefix_periodkey): value}."""
	out: dict[tuple[str, str, str], float] = {}
	task_id = task.get("value") or ""
	for role_entry in task.get("role_data") or []:
		role = role_entry.get("role") or ""
		for key, value in role_entry.items():
			if key == "role" or key.startswith("fact_utps_"):
				continue
			if key.startswith(("plan_", "forecast_", "fact_")):
				prefix, period_key = key.split("_", 1)
				out[(task_id, role, f"{prefix}_{period_key}")] = _round_num(value)
	return out


def _v2_period_values(rows: list) -> dict[tuple[str, str, str], float]:
	out: dict[tuple[str, str, str], float] = {}
	for row in rows:
		task_id = row.get("task_id") or ""
		role = row.get("role") or ""
		for key, value in row.items():
			if key.startswith(("plan_", "forecast_", "fact_", "actual_", "delta_")) and key.count("_") >= 2:
				out[(task_id, role, key)] = _round_num(value)
	return out


def _iter_role_entries(task: dict) -> list[dict]:
	from project_workload_assignment.project_workload_assignment.work_efforts.consolidated_data import (
		keep_role_entry,
	)

	role_data = [r for r in (task.get("role_data") or []) if keep_role_entry(r)]
	return role_data if role_data else [{"role": None}]


def _legacy_actual_delta_values(
	tasks: list,
	periods: list,
	view_mode: str,
) -> dict[tuple[str, str, str], float]:
	"""actual/delta как в grid_data._resolve_actual / _calc_delta_pct."""
	out: dict[tuple[str, str, str], float] = {}
	for task in tasks:
		task_id = task.get("value") or ""
		for role_entry in _iter_role_entries(task):
			role = role_entry.get("role") or ""
			for period in periods:
				key = period["key"]
				plan = _round_num(role_entry.get(f"plan_{key}"))
				forecast = _round_num(role_entry.get(f"forecast_{key}"))
				fact = _round_num(role_entry.get(f"fact_{key}"))
				if view_mode == "forecast_only":
					actual = forecast
				elif view_mode == "fact_only":
					actual = fact
				else:
					actual = fact if period["is_past"] else forecast
				delta = round(((actual - plan) / plan) * 100, 1) if plan else 0.0
				out[(task_id, role, f"actual_{key}")] = actual
				out[(task_id, role, f"delta_{key}")] = delta
	return out


class TestWeGridParity(FrappeTestCase):
	def test_grid_plan_forecast_fact_matches_consolidated(self):
		"""v2 scalar rows содержат те же plan/forecast/fact, что legacy role_data."""
		if not dependency_project_available():
			self.skipTest(f"Dependency project {DEPENDENCY_PROJECT!r} не найден на сайте")

		form_input = {"project": DEPENDENCY_PROJECT, "view_options": "Прогноз и факт"}
		legacy = run_get_work_efforts_consolidated_data(form_input)
		v2 = run_get_work_efforts_grid(form_input)

		self.assertIsInstance(v2, dict)
		self.assertIn("rows", v2)
		self.assertIn("periods", v2)
		self.assertGreater(len(v2["rows"]), 0)

		legacy_values: dict[tuple[str, str, str], float] = {}
		for task in legacy:
			legacy_values.update(_legacy_period_values(task))

		v2_values = _v2_period_values(v2["rows"])

		self.assertTrue(
			set(legacy_values.keys()).issubset(set(v2_values.keys())),
			msg="v2 must include all legacy period keys",
		)
		for key, expected in legacy_values.items():
			actual = v2_values.get(key, 0)
			self.assertAlmostEqual(actual or 0, expected, places=2, msg=f"Mismatch for {key}")

	def test_grid_actual_and_delta_match_view_mode(self):
		"""actual/delta в v2 совпадают с server resolve по view_mode."""
		if not dependency_project_available():
			self.skipTest(f"Dependency project {DEPENDENCY_PROJECT!r} не найден на сайте")

		form_input = {"project": DEPENDENCY_PROJECT, "view_options": "Прогноз и факт"}
		legacy = run_get_work_efforts_consolidated_data(form_input)
		v2 = run_get_work_efforts_grid(form_input)
		view_mode = normalize_view_mode(form_input["view_options"])
		periods = get_display_periods(DEPENDENCY_PROJECT, "month", view_mode)

		expected = _legacy_actual_delta_values(legacy, periods, view_mode)
		actual_map = _v2_period_values(v2["rows"])

		for key, expected_value in expected.items():
			self.assertAlmostEqual(
				actual_map.get(key, 0) or 0,
				expected_value,
				places=2,
				msg=f"Mismatch for {key}",
			)

	def test_flatten_helper_matches_grid_api(self):
		"""flatten_consolidated_tasks_to_v2_rows даёт тот же rows[], что API."""
		if not dependency_project_available():
			self.skipTest(f"Dependency project {DEPENDENCY_PROJECT!r} не найден на сайте")

		form_input = {"project": DEPENDENCY_PROJECT, "view_options": "Прогноз и факт"}
		legacy = run_get_work_efforts_consolidated_data(form_input)
		v2 = run_get_work_efforts_grid(form_input)
		view_mode = normalize_view_mode(form_input["view_options"])
		periods = get_display_periods(DEPENDENCY_PROJECT, "month", view_mode)

		flat = flatten_consolidated_tasks_to_v2_rows(legacy, periods, view_mode)
		self.assertEqual(len(flat), len(v2["rows"]))
		self.assertEqual(_v2_period_values(flat), _v2_period_values(v2["rows"]))

	def test_grid_row_count_matches_role_lines(self):
		"""Число v2 rows = сумма role_data по задачам (или 1 если ролей нет)."""
		if not dependency_project_available():
			self.skipTest(f"Dependency project {DEPENDENCY_PROJECT!r} не найден на сайте")

		legacy = run_get_work_efforts_consolidated_data({"project": DEPENDENCY_PROJECT})
		v2 = run_get_work_efforts_grid({"project": DEPENDENCY_PROJECT})

		from project_workload_assignment.project_workload_assignment.work_efforts.consolidated_data import (
			keep_role_entry,
		)

		expected_rows = 0
		for task in legacy:
			roles = [r for r in (task.get("role_data") or []) if keep_role_entry(r)]
			expected_rows += len(roles) if roles else 1

		self.assertEqual(len(v2["rows"]), expected_rows)

	def test_grid_summary_rows_match_legacy_totals(self):
		"""summary_rows в API = root rollup totals по периодам."""
		if not dependency_project_available():
			self.skipTest(f"Dependency project {DEPENDENCY_PROJECT!r} не найден на сайте")

		form_input = {"project": DEPENDENCY_PROJECT, "view_options": "Прогноз и факт"}
		legacy = run_get_work_efforts_consolidated_data(form_input)
		v2 = run_get_work_efforts_grid(form_input)
		view_mode = normalize_view_mode(form_input["view_options"])
		periods = get_display_periods(DEPENDENCY_PROJECT, "month", view_mode)

		self.assertIn("summary_rows", v2)
		self.assertEqual(len(v2["summary_rows"]), 1)

		summary = v2["summary_rows"][0]
		expected_summary = build_we_summary_rows(
			DEPENDENCY_PROJECT, legacy, periods, view_mode, include_plan=True
		)[0]

		for period in periods:
			key = period["key"]
			for field in (f"plan_{key}", f"actual_{key}", f"delta_{key}"):
				self.assertAlmostEqual(
					summary.get(field, 0) or 0,
					expected_summary.get(field, 0) or 0,
					places=2,
					msg=f"Summary mismatch for {field}",
				)

	def test_grid_view_modes_change_actual_and_period_flags(self):
		"""Фаза 9: view_mode меняет is_past периодов и actual/delta."""
		if not dependency_project_available():
			self.skipTest(f"Dependency project {DEPENDENCY_PROJECT!r} не найден на сайте")

		modes = (
			("Прогноз и факт", "forecast_and_fact"),
			("Только прогноз", "forecast_only"),
			("Только факт", "fact_only"),
		)
		for view_options, expected_mode in modes:
			form_input = {"project": DEPENDENCY_PROJECT, "view_options": view_options}
			legacy = run_get_work_efforts_consolidated_data({"project": DEPENDENCY_PROJECT})
			v2 = run_get_work_efforts_grid(form_input)
			self.assertEqual(v2["view_mode"], expected_mode)

			periods = v2["periods"]
			if expected_mode == "forecast_only":
				self.assertTrue(all(not p["is_past"] for p in periods), msg=view_options)
			elif expected_mode == "fact_only":
				self.assertTrue(all(p["is_past"] for p in periods), msg=view_options)

			expected = _legacy_actual_delta_values(legacy, periods, expected_mode)
			actual_map = _v2_period_values(v2["rows"])
			for key, expected_value in expected.items():
				self.assertAlmostEqual(
					actual_map.get(key, 0) or 0,
					expected_value,
					places=2,
					msg=f"{view_options}: mismatch for {key}",
				)

	def test_grid_rows_include_task_date_fields(self):
		"""Фаза 10: rows несут даты задачи для cellClassRules."""
		if not dependency_project_available():
			self.skipTest(f"Dependency project {DEPENDENCY_PROJECT!r} не найден на сайте")

		v2 = run_get_work_efforts_grid({"project": DEPENDENCY_PROJECT})
		self.assertGreater(len(v2["rows"]), 0)
		row = v2["rows"][0]
		for field in (
			"exp_start_date",
			"exp_end_date",
			"custom_planned_start_date",
			"custom_planned_end_date",
			"act_start_date",
			"act_end_date",
		):
			self.assertIn(field, row)
