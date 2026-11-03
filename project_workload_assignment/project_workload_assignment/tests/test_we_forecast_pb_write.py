# Copyright (c) 2026, Dinext
"""Unit tests: WE → Project Budget period write keeps ADD; clear reuses row + flag."""

from __future__ import annotations

from types import SimpleNamespace

from frappe.tests.utils import FrappeTestCase

from project_workload_assignment.project_workload_assignment.forecast.forecast_from_work_efforts import (
	apply_we_period_forecast,
)


def _row(year, month, expected, has_expected=1):
	return SimpleNamespace(
		pba_year=year,
		pba_month=month,
		pba_expected=expected,
		pba_has_expected=has_expected,
	)


def _doc(name, rows):
	doc = SimpleNamespace(name=name, project_budget_amount=list(rows))

	def append(_child, values):
		doc.project_budget_amount.append(SimpleNamespace(**values))

	doc.append = append
	return doc


class TestWeForecastPbWrite(FrappeTestCase):
	def test_add_accumulates_on_existing_row(self):
		doc = _doc("PB-1", [_row(2026, 10, 100)])
		apply_we_period_forecast(doc, 2026, 10, 100)
		self.assertEqual(doc.project_budget_amount[0].pba_expected, 200)
		self.assertEqual(len(doc.project_budget_amount), 1)

	def test_clear_then_rewrite_reuses_row_and_restores_flag(self):
		doc = _doc("PB-1", [_row(2026, 10, 0, has_expected=0)])
		got = apply_we_period_forecast(doc, 2026, 10, 123.45)
		self.assertEqual(got, 123.45)
		self.assertEqual(len(doc.project_budget_amount), 1)
		self.assertEqual(doc.project_budget_amount[0].pba_expected, 123.45)
		self.assertEqual(doc.project_budget_amount[0].pba_has_expected, 1)

	def test_missing_period_appends_new_row(self):
		doc = _doc("PB-1", [])
		got = apply_we_period_forecast(doc, 2026, 11, 50)
		self.assertEqual(got, 50)
		self.assertEqual(len(doc.project_budget_amount), 1)
		self.assertEqual(doc.project_budget_amount[0].pba_has_expected, 1)
