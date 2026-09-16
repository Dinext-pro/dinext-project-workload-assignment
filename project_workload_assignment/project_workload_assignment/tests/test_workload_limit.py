# Copyright (c) 2026, Dinext
"""ISS-2026-02108: лимит загрузки на команде / дереве проекта."""

from __future__ import annotations

from datetime import date

from frappe.tests.utils import FrappeTestCase

from project_workload_assignment.project_workload_assignment.project_workload.canonical.reshape import (
	reshape_project_tree,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.team_limits import (
	FULL_FUND_LIMIT,
	_row_interval,
	fill_person_limit_remainders,
	find_team_limit_sum_violations,
	is_explicit_limit,
	normalize_workload_limit,
	peak_limit_sum,
	resolve_person_limits,
	resolve_role_limit,
	resolve_user_limit,
	row_overlaps_window,
)


class _FakeTeamRow:
	"""Как Frappe Document: `.get` / attr есть, `__getitem__` нет."""

	def __init__(self, **values):
		self.__dict__.update(values)

	def get(self, key, default=None):
		return getattr(self, key, default)


class TestWorkloadLimitHelpers(FrappeTestCase):
	def test_normalize_empty_and_zero_are_full_fund(self):
		self.assertEqual(normalize_workload_limit(None), FULL_FUND_LIMIT)
		self.assertEqual(normalize_workload_limit(""), FULL_FUND_LIMIT)
		self.assertEqual(normalize_workload_limit(0), FULL_FUND_LIMIT)
		self.assertEqual(normalize_workload_limit(50), 50)

	def test_is_explicit_limit(self):
		self.assertFalse(is_explicit_limit(None))
		self.assertFalse(is_explicit_limit(""))
		self.assertFalse(is_explicit_limit("  "))
		self.assertTrue(is_explicit_limit(0))
		self.assertTrue(is_explicit_limit(20))
		self.assertFalse(is_explicit_limit(100))
		self.assertFalse(is_explicit_limit(100.0))

	def test_validity_window_overlap(self):
		window_start = date(2026, 9, 1)
		window_end = date(2026, 9, 30)
		self.assertTrue(row_overlaps_window({}, window_start, window_end))
		self.assertTrue(
			row_overlaps_window(
				{"pt_valid_from": "2026-09-10", "pt_valid_for": "2026-10-10"},
				window_start,
				window_end,
			)
		)
		self.assertFalse(
			row_overlaps_window(
				{"pt_valid_from": "2026-10-01", "pt_valid_for": "2026-10-31"},
				window_start,
				window_end,
			)
		)

	def test_user_limit_is_capped_sum_of_roles(self):
		limits = {("a@x", "Dev"): 40.0, ("a@x", "PM"): 70.0}
		self.assertEqual(resolve_role_limit(limits, "a@x", "Dev"), 40)
		self.assertEqual(resolve_role_limit(limits, "a@x", "PM"), 70)
		self.assertEqual(resolve_user_limit(limits, "a@x", ["Dev", "PM"]), 100)
		self.assertEqual(resolve_role_limit(limits, "a@x", "QA"), FULL_FUND_LIMIT)
		self.assertEqual(resolve_user_limit(limits, "a@x", ["Dev"]), 40)

		limits_ivan = {("a@x", "Dev"): 40.0, ("a@x", "PM"): 60.0}
		self.assertEqual(resolve_user_limit(limits_ivan, "a@x", ["Dev", "PM"]), 100)

		limits_under = {("a@x", "Dev"): 40.0, ("a@x", "PM"): 40.0}
		self.assertEqual(resolve_user_limit(limits_under, "a@x", ["Dev", "PM"]), 80)

	def test_peak_sum_blocks_overlapping_over_100(self):
		rows = [
			{"pt_participant": "a@x", "pt_role": "Dev", "workload_limit": 70},
			{"pt_participant": "a@x", "pt_role": "PM", "workload_limit": 40},
		]
		self.assertEqual(peak_limit_sum(rows), 110)
		self.assertEqual(len(find_team_limit_sum_violations(rows)), 1)

	def test_peak_sum_allows_sequential_periods(self):
		rows = [
			{
				"pt_participant": "a@x",
				"pt_role": "Dev",
				"workload_limit": 70,
				"pt_valid_from": "2026-01-01",
				"pt_valid_for": "2026-06-30",
			},
			{
				"pt_participant": "a@x",
				"pt_role": "PM",
				"workload_limit": 40,
				"pt_valid_from": "2026-07-01",
				"pt_valid_for": "2026-12-31",
			},
		]
		self.assertEqual(peak_limit_sum(rows), 70)
		self.assertEqual(find_team_limit_sum_violations(rows), [])

	def test_peak_sum_three_way_overlap(self):
		rows = [
			{
				"pt_participant": "a@x",
				"workload_limit": 40,
				"pt_valid_from": "2026-01-01",
				"pt_valid_for": "2026-12-31",
			},
			{
				"pt_participant": "a@x",
				"workload_limit": 40,
				"pt_valid_from": "2026-01-01",
				"pt_valid_for": "2026-06-30",
			},
			{
				"pt_participant": "a@x",
				"workload_limit": 40,
				"pt_valid_from": "2026-03-01",
				"pt_valid_for": "2026-12-31",
			},
		]
		self.assertEqual(peak_limit_sum(rows), 120)
		self.assertEqual(len(find_team_limit_sum_violations(rows)), 1)

	def test_one_empty_role_writes_100(self):
		rows = [{"pt_participant": "a@x", "workload_limit": None}]
		self.assertTrue(fill_person_limit_remainders(rows))
		self.assertEqual(rows[0]["workload_limit"], 100)
		self.assertEqual(resolve_person_limits(rows), [100])

	def test_two_overlapping_empties_share_half(self):
		rows = [
			{"pt_participant": "a@x", "workload_limit": None},
			{"pt_participant": "a@x", "workload_limit": ""},
		]
		self.assertTrue(fill_person_limit_remainders(rows))
		self.assertEqual([row["workload_limit"] for row in rows], [50.0, 50.0])
		self.assertEqual(find_team_limit_sum_violations(rows), [])

	def test_explicit_plus_empty_writes_remainder(self):
		rows = [
			{"pt_participant": "a@x", "workload_limit": 20},
			{"pt_participant": "a@x", "workload_limit": None},
		]
		self.assertTrue(fill_person_limit_remainders(rows))
		self.assertEqual([row["workload_limit"] for row in rows], [20, 80.0])

	def test_explicit_plus_two_empties_split_remainder(self):
		rows = [
			{"pt_participant": "a@x", "workload_limit": 20},
			{"pt_participant": "a@x", "workload_limit": None},
			{"pt_participant": "a@x", "workload_limit": None},
		]
		self.assertTrue(fill_person_limit_remainders(rows))
		self.assertEqual([row["workload_limit"] for row in rows], [20, 40.0, 40.0])

	def test_non_overlapping_empty_stays_full_fund(self):
		rows = [
			{
				"pt_participant": "a@x",
				"workload_limit": 70,
				"pt_valid_from": "2026-01-01",
				"pt_valid_for": "2026-06-30",
			},
			{
				"pt_participant": "a@x",
				"workload_limit": None,
				"pt_valid_from": "2026-07-01",
				"pt_valid_for": "2026-12-31",
			},
		]
		self.assertTrue(fill_person_limit_remainders(rows))
		self.assertEqual(rows[0]["workload_limit"], 70)
		self.assertEqual(rows[1]["workload_limit"], 100)
		self.assertEqual(find_team_limit_sum_violations(rows), [])

	def test_default_hundreds_split_equally(self):
		rows = [
			{"pt_participant": "a@x", "workload_limit": 100},
			{"pt_participant": "a@x", "workload_limit": 100},
			{"pt_participant": "a@x", "workload_limit": 100},
		]
		self.assertTrue(fill_person_limit_remainders(rows))
		self.assertAlmostEqual(sum(row["workload_limit"] for row in rows), 100)
		self.assertEqual(find_team_limit_sum_violations(rows), [])

	def test_twenty_plus_default_hundred_writes_eighty(self):
		rows = [
			{"pt_participant": "a@x", "workload_limit": 20},
			{"pt_participant": "a@x", "workload_limit": 100},
		]
		self.assertTrue(fill_person_limit_remainders(rows))
		self.assertEqual([row["workload_limit"] for row in rows], [20, 80.0])

	def test_zero_plus_eighty_overlapping_keeps_zero(self):
		rows = [
			{"pt_participant": "a@x", "workload_limit": 0},
			{"pt_participant": "a@x", "workload_limit": 80},
		]
		self.assertFalse(fill_person_limit_remainders(rows))
		self.assertEqual([row["workload_limit"] for row in rows], [0, 80])
		self.assertEqual(peak_limit_sum(rows), 80)
		self.assertEqual(find_team_limit_sum_violations(rows), [])

	def test_empty_plus_zero_plus_eighty(self):
		rows = [
			{"pt_participant": "a@x", "workload_limit": None},
			{"pt_participant": "a@x", "workload_limit": 0},
			{"pt_participant": "a@x", "workload_limit": 80},
		]
		self.assertTrue(fill_person_limit_remainders(rows))
		self.assertEqual([row["workload_limit"] for row in rows], [20.0, 0, 80])
		self.assertEqual(find_team_limit_sum_violations(rows), [])

	def test_peak_sum_skips_virtuals_and_other_people(self):
		rows = [
			{"pt_participant": "a@x", "workload_limit": 70},
			{"virtual_worker": 1, "pt_role": "QA", "workload_limit": 70},
			{"pt_participant": "b@x", "workload_limit": 70},
		]
		self.assertEqual(find_team_limit_sum_violations(rows), [])

	def test_document_rows_without_getitem(self):
		rows = [
			_FakeTeamRow(
				pt_participant="a@x",
				workload_limit=70,
				pt_valid_from="2026-01-01",
				pt_valid_for="2026-06-30",
			),
			_FakeTeamRow(
				pt_participant="a@x",
				workload_limit=40,
				pt_valid_from="2026-07-01",
				pt_valid_for="2026-12-31",
			),
		]
		self.assertRaises(TypeError, lambda: rows[0]["pt_valid_from"])
		start, end = _row_interval(rows[0])
		self.assertEqual(start, date(2026, 1, 1))
		self.assertEqual(end, date(2026, 6, 30))
		empty_start, empty_end = _row_interval(_FakeTeamRow(pt_participant="a@x"))
		self.assertEqual(empty_start, date.min)
		self.assertEqual(empty_end, date.max)
		self.assertEqual(peak_limit_sum(rows), 70)
		self.assertEqual(find_team_limit_sum_violations(rows), [])
		overlap = [
			_FakeTeamRow(pt_participant="a@x", workload_limit=70),
			_FakeTeamRow(pt_participant="a@x", workload_limit=40),
		]
		self.assertEqual(peak_limit_sum(overlap), 110)
		self.assertEqual(len(find_team_limit_sum_violations(overlap)), 1)
		empties = [
			_FakeTeamRow(pt_participant="a@x", workload_limit=None),
			_FakeTeamRow(pt_participant="a@x", workload_limit=None),
		]
		self.assertTrue(fill_person_limit_remainders(empties))
		self.assertEqual(find_team_limit_sum_violations(empties), [])
		self.assertEqual([row.workload_limit for row in empties], [50.0, 50.0])
		zero_eighty = [
			_FakeTeamRow(pt_participant="a@x", workload_limit=0),
			_FakeTeamRow(pt_participant="a@x", workload_limit=80),
		]
		self.assertFalse(fill_person_limit_remainders(zero_eighty))
		self.assertEqual(peak_limit_sum(zero_eighty), 80)
		self.assertEqual(find_team_limit_sum_violations(zero_eighty), [])


class TestProjectTreeCapacityStamp(FrappeTestCase):
	def test_reshape_stamps_hours_absences_and_limit(self):
		msg = {
			"periods": [{"key": "workload_2026-09-15", "date": "2026-09-15"}],
			"tree_data": [
				{
					"email": "a@x",
					"isUser": True,
					"indent": 0,
					"user_data": {"full_name": "A", "email": "a@x"},
					"workload_limit": 40,
				},
				{
					"email": "a@x",
					"isRole": True,
					"role": "Dev",
					"indent": 1,
					"workload_limit": 50,
				},
			],
			"metadata": {
				"user_daily_hours": {"a@x": {"2026-09-15": 8}},
				"user_absences": {
					"a@x": [
						{
							"from_date": "2026-09-15",
							"to_date": "2026-09-15",
							"type": "Leave",
							"alfrom_hours": 2,
							"alto_hours": 2,
						}
					]
				},
			},
		}
		out = reshape_project_tree(msg)
		user = out["rows"][0]
		role = user["children"][0]
		self.assertEqual(user["workload_limit"], 40)
		self.assertEqual(role["workload_limit"], 50)
		self.assertEqual(user["workingHours"]["2026-09-15"], 8)
		self.assertEqual(role["workingHours"]["2026-09-15"], 8)
		self.assertEqual(user["absences"][0]["type"], "Leave")
		self.assertEqual(role["absences"][0]["alfrom_hours"], 2)
