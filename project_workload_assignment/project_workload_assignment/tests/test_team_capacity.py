# Copyright (c) 2026, Dinext
"""ISS-2026-02108: ёмкость графика = фонд команды."""

from __future__ import annotations

from datetime import date

from frappe.tests.utils import FrappeTestCase

from project_workload_assignment.project_workload_assignment.project_workload.core.team_capacity import (
	compute_team_capacity_series,
	virtual_available_hours,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.team_limits import (
	capped_sum_limit,
	date_in_team_row,
)


class _FakeCapacityCtx:
	def __init__(self, hours_by_user, holiday_dates=None, project="PROJ"):
		self.projects_data = {project: {"effective_holiday_list": "HL"}}
		self.holiday_date_sets = {"HL": {day: True for day in (holiday_dates or [])}}
		self._hours = hours_by_user

	def get_available_hours(self, date_str, user, project):
		return self._hours.get(user, {}).get(date_str, 0.0)


def _one_day():
	return {"2026-09-15": "p0"}, {"p0": 0}


class TestTeamCapacityHelpers(FrappeTestCase):
	def test_date_in_team_row_respects_validity(self):
		self.assertTrue(date_in_team_row({}, "2026-09-15"))
		self.assertTrue(
			date_in_team_row(
				{"pt_valid_from": "2026-09-10", "pt_valid_for": "2026-09-20"},
				"2026-09-15",
			)
		)
		self.assertFalse(
			date_in_team_row(
				{"pt_valid_from": "2026-09-16", "pt_valid_for": "2026-09-20"},
				"2026-09-15",
			)
		)
		self.assertFalse(date_in_team_row({"pt_valid_for": date(2026, 9, 14)}, "2026-09-15"))

	def test_capped_sum_limit(self):
		self.assertEqual(capped_sum_limit([40, 70]), 100)
		self.assertEqual(capped_sum_limit([40, 40]), 80)
		self.assertEqual(capped_sum_limit([50]), 50)
		self.assertEqual(capped_sum_limit([0, 80]), 80)


class TestComputeTeamCapacitySeries(FrappeTestCase):
	def _run(self, rows, hours=None, *, consider_virtuals=False, worker_wtype=None, role_filters=None, holidays=None):
		date_to_period_key, period_index = _one_day()
		ctx = _FakeCapacityCtx(hours or {"a@x": {"2026-09-15": 8.0}}, holiday_dates=holidays)
		return compute_team_capacity_series(
			"PROJ",
			rows,
			ctx,
			date_to_period_key,
			period_index,
			consider_virtuals=consider_virtuals,
			worker_wtype=worker_wtype,
			role_filters=role_filters,
			users_data={"a@x": {}, "b@x": {}},
			wtypes_map={"a@x": "Employee", "b@x": "Supplier"},
			period_count=1,
		)

	def test_two_roles_count_person_once(self):
		rows = [
			{"name": "r1", "pt_participant": "a@x", "pt_role": "Dev", "workload_limit": 40},
			{"name": "r2", "pt_participant": "a@x", "pt_role": "PM", "workload_limit": 70},
		]
		gross, net = self._run(rows)
		self.assertEqual(gross[0], 8.0)
		self.assertEqual(net[0], 8.0)

	def test_two_roles_80_percent_net(self):
		rows = [
			{"name": "r1", "pt_participant": "a@x", "pt_role": "Dev", "workload_limit": 40},
			{"name": "r2", "pt_participant": "a@x", "pt_role": "PM", "workload_limit": 40},
		]
		gross, net = self._run(rows)
		self.assertEqual(gross[0], 8.0)
		self.assertAlmostEqual(net[0], 6.4)

	def test_same_role_uses_min_limit(self):
		rows = [
			{"name": "r1", "pt_participant": "a@x", "pt_role": "Dev", "workload_limit": 70},
			{"name": "r2", "pt_participant": "a@x", "pt_role": "Dev", "workload_limit": 40},
		]
		_, net = self._run(rows)
		self.assertAlmostEqual(net[0], 3.2)

	def test_pwa_user_without_team_row_is_ignored(self):
		gross, net = self._run([])
		self.assertEqual(gross[0], 0.0)
		self.assertEqual(net[0], 0.0)

	def test_virtuals_off_skips_virtual_row(self):
		rows = [
			{"name": "r1", "pt_participant": "a@x", "pt_role": "Dev", "workload_limit": 100},
			{"name": "v1", "virtual_worker": 1, "pt_role": "QA", "workload_limit": 100},
		]
		gross, _ = self._run(rows, consider_virtuals=False)
		self.assertEqual(gross[0], 8.0)

	def test_virtuals_on_adds_default_hours(self):
		rows = [
			{"name": "v1", "virtual_worker": 1, "pt_role": "QA", "workload_limit": 50},
		]
		gross, net = self._run(rows, hours={}, consider_virtuals=True)
		self.assertEqual(gross[0], 8.0)
		self.assertEqual(net[0], 4.0)

	def test_virtuals_on_project_holiday_is_zero(self):
		rows = [
			{"name": "v1", "virtual_worker": 1, "pt_role": "QA", "workload_limit": 100},
		]
		gross, _ = self._run(rows, hours={}, consider_virtuals=True, holidays=["2026-09-15"])
		self.assertEqual(gross[0], 0.0)

	def test_validity_excludes_day(self):
		rows = [
			{
				"name": "r1",
				"pt_participant": "a@x",
				"pt_role": "Dev",
				"workload_limit": 100,
				"pt_valid_from": "2026-09-16",
			}
		]
		gross, _ = self._run(rows)
		self.assertEqual(gross[0], 0.0)

	def test_role_filter_uses_that_role_limit(self):
		rows = [
			{"name": "r1", "pt_participant": "a@x", "pt_role": "Dev", "workload_limit": 40},
			{"name": "r2", "pt_participant": "a@x", "pt_role": "PM", "workload_limit": 70},
		]
		gross, net = self._run(rows, role_filters=["Dev"])
		self.assertEqual(gross[0], 8.0)
		self.assertAlmostEqual(net[0], 3.2)

	def test_worker_wtype_filter_skips_other_real(self):
		rows = [
			{"name": "r1", "pt_participant": "a@x", "pt_role": "Dev", "workload_limit": 100},
			{"name": "r2", "pt_participant": "b@x", "pt_role": "QA", "workload_limit": 100},
		]
		gross, _ = self._run(
			rows,
			hours={"a@x": {"2026-09-15": 8.0}, "b@x": {"2026-09-15": 8.0}},
			worker_wtype="Employee",
		)
		self.assertEqual(gross[0], 8.0)

	def test_virtual_available_hours_helper(self):
		ctx = _FakeCapacityCtx({}, holiday_dates=["2026-09-15"])
		self.assertEqual(virtual_available_hours("2026-09-15", "PROJ", ctx), 0.0)
		self.assertEqual(virtual_available_hours("2026-09-16", "PROJ", ctx), 8.0)
