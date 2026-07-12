# Copyright (c) 2026, Dinext
"""Tests for WE grid v2 forecast save validation."""

from __future__ import annotations

from frappe.tests.utils import FrappeTestCase

from project_workload_assignment.project_workload_assignment.project_workload.work_efforts.v2.grid_data import (
    run_get_work_efforts_grid_v2,
)
from project_workload_assignment.project_workload_assignment.project_workload.work_efforts.v2.save import (
    _get_child_forecast_sum,
    _get_parent_forecast_limit,
    _validate_change,
    run_save_forecast_changes,
)
from project_workload_assignment.project_workload_assignment.tests.scenarios.we_ss_migration_baseline.data_setup import (
    DEPENDENCY_PROJECT,
    dependency_project_available,
)


def _make_row(task_id, role, parent_task_id, forecast_2026_8):
    return {
        "task_id": task_id,
        "role": role,
        "parent_task_id": parent_task_id,
        "forecast_2026_8": forecast_2026_8,
    }


class TestWeV2SaveValidation(FrappeTestCase):
    def test_parent_value_below_children_sum_is_rejected(self):
        rows = [
            _make_row("parent", "Dev", None, 10),
            _make_row("child1", "Dev", "parent", 6),
            _make_row("child2", "Dev", "parent", 4),
        ]
        error = _validate_change(
            rows,
            {"task_id": "parent", "role": "Dev", "period_key": "2026_8", "value": 5},
        )
        self.assertIsNotNone(error)

    def test_parent_value_equal_to_children_sum_is_allowed(self):
        rows = [
            _make_row("parent", "Dev", None, 10),
            _make_row("child1", "Dev", "parent", 6),
            _make_row("child2", "Dev", "parent", 4),
        ]
        error = _validate_change(
            rows,
            {"task_id": "parent", "role": "Dev", "period_key": "2026_8", "value": 10},
        )
        self.assertIsNone(error)

    def test_child_value_above_parent_limit_is_rejected(self):
        rows = [
            _make_row("parent", "Dev", None, 10),
            _make_row("child1", "Dev", "parent", 6),
            _make_row("child2", "Dev", "parent", 0),
        ]
        error = _validate_change(
            rows,
            {"task_id": "child2", "role": "Dev", "period_key": "2026_8", "value": 8},
        )
        self.assertIsNotNone(error)

    def test_child_value_within_parent_limit_is_allowed(self):
        rows = [
            _make_row("parent", "Dev", None, 10),
            _make_row("child1", "Dev", "parent", 6),
            _make_row("child2", "Dev", "parent", 0),
        ]
        error = _validate_change(
            rows,
            {"task_id": "child2", "role": "Dev", "period_key": "2026_8", "value": 4},
        )
        self.assertIsNone(error)

    def test_child_forecast_sum_recurses_when_direct_value_is_zero(self):
        rows = [
            _make_row("parent", "Dev", None, 0),
            _make_row("child1", "Dev", "parent", 0),
            _make_row("grandchild", "Dev", "child1", 7),
        ]
        total = _get_child_forecast_sum(rows, "parent", "Dev", "2026_8")
        self.assertAlmostEqual(total, 7)

    def test_parent_limit_recurses_when_parent_value_is_zero(self):
        rows = [
            _make_row("grandparent", "Dev", None, 10),
            _make_row("parent", "Dev", "grandparent", 0),
            _make_row("child", "Dev", "parent", 0),
        ]
        limit = _get_parent_forecast_limit(rows, "child", "Dev", "2026_8")
        self.assertAlmostEqual(limit, 10)


class TestWeV2SaveForecast(FrappeTestCase):
    def test_save_forecast_change_updates_value(self):
        if not dependency_project_available():
            self.skipTest(f"Dependency project {DEPENDENCY_PROJECT!r} не найден на сайте")

        grid = run_get_work_efforts_grid_v2({"project": DEPENDENCY_PROJECT})
        self.assertTrue(grid.get("rows"))

        editable_rows = [
            row
            for row in grid["rows"]
            if row.get("role") and not row.get("has_children")
        ]
        self.assertTrue(editable_rows, "No editable rows with role found")
        target_row = editable_rows[0]
        task_id = target_row["task_id"]
        role = target_row["role"]

        future_periods = [p for p in grid["periods"] if not p["is_past"]]
        self.assertTrue(future_periods, "No future periods in dependency project")
        period = future_periods[0]
        period_key = period["key"]
        forecast_key = f"forecast_{period_key}"

        original_value = float(target_row.get(forecast_key) or 0)
        new_value = original_value + 1

        try:
            run_save_forecast_changes(
                {
                    "project": DEPENDENCY_PROJECT,
                    "changes": [
                        {
                            "task_id": task_id,
                            "role": role,
                            "period_key": period_key,
                            "year": period["year"],
                            "month": period["month"],
                            "value": new_value,
                        }
                    ],
                }
            )

            updated_grid = run_get_work_efforts_grid_v2({"project": DEPENDENCY_PROJECT})
            updated_row = next(
                (
                    r
                    for r in updated_grid["rows"]
                    if r.get("task_id") == task_id and r.get("role") == role
                ),
                None,
            )
            self.assertIsNotNone(updated_row)
            self.assertAlmostEqual(
                float(updated_row.get(forecast_key) or 0), new_value, places=2
            )
        finally:
            run_save_forecast_changes(
                {
                    "project": DEPENDENCY_PROJECT,
                    "changes": [
                        {
                            "task_id": task_id,
                            "role": role,
                            "period_key": period_key,
                            "year": period["year"],
                            "month": period["month"],
                            "value": original_value,
                        }
                    ],
                }
            )
