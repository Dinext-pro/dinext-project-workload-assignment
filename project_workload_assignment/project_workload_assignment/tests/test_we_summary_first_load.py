# Copyright (c) 2026, Dinext
"""First-load plan totals vs save-plan + reload (hide_plan / include_plan)."""

from __future__ import annotations

import json

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt

from project_workload_assignment.project_workload_assignment.work_efforts.grid_data import (
	run_get_work_efforts_grid,
)
from project_workload_assignment.project_workload_assignment.work_efforts.save_forecast_as_plan import (
	run_save_forecast_as_plan,
)

PREFIX = "WE-SUM-FIX"
ROLE_NAME = f"{PREFIX} Role"
YEAR = 2026
MONTH_PARENT = 3
MONTH_CHILD = 4


def _company() -> str:
	row = frappe.db.sql("select name from `tabCompany` limit 1", as_dict=True)
	if not row:
		frappe.throw("No Company")
	return row[0].name


def _project_type() -> str:
	for cand in ("Внутренний", "Internal", "Коммерческий"):
		if frappe.db.exists("Project Type", cand):
			return cand
	row = frappe.db.sql("select name from `tabProject Type` limit 1", as_dict=True)
	return row[0].name


def _payment_scheme() -> str:
	for cand in ("Неоплачиваемый", "Время и затраты (T&M)", "Фикс. стоимость"):
		if frappe.db.exists("Project Payment Scheme", cand):
			return cand
	row = frappe.db.sql("select name from `tabProject Payment Scheme` limit 1", as_dict=True)
	return row[0].name


def _fiscal_year(year: int, month: int) -> str:
	start = f"{year}-{month:02d}-01"
	end = frappe.utils.get_last_day(start)
	rows = frappe.db.sql(
		"""
		select name from `tabFiscal Year`
		where year_start_date <= %(end)s and year_end_date >= %(start)s
		limit 1
		""",
		{"start": start, "end": end},
	)
	if not rows:
		frappe.throw("No Fiscal Year")
	return rows[0][0]


def _reset() -> None:
	tasks = frappe.get_all(
		"Task", filters={"subject": ["like", f"{PREFIX}%"]}, pluck="name", order_by="lft desc"
	)
	if tasks:
		for pwe in frappe.get_all(
			"Project Work Efforts", filters={"pwe_task": ["in", tasks]}, pluck="name"
		):
			frappe.delete_doc("Project Work Efforts", pwe, force=True, ignore_permissions=True)
	for task in tasks:
		frappe.delete_doc("Task", task, force=True, ignore_permissions=True)
	for proj in frappe.get_all(
		"Project", filters={"project_name": ["like", f"{PREFIX}%"]}, pluck="name"
	):
		frappe.delete_doc("Project", proj, force=True, ignore_permissions=True)
	if frappe.db.exists("Project Role", ROLE_NAME):
		frappe.delete_doc("Project Role", ROLE_NAME, force=True, ignore_permissions=True)


def _ensure_role() -> str:
	if not frappe.db.exists("Project Role", ROLE_NAME):
		frappe.get_doc({"doctype": "Project Role", "role_name": ROLE_NAME, "enabled": 1}).insert(
			ignore_permissions=True
		)
	return ROLE_NAME


def _summary_totals(message: dict) -> tuple[float, float]:
	row = (message.get("summary_rows") or [{}])[0]
	keys = [p["key"] for p in message.get("periods") or []]
	plan = sum(flt(row.get(f"plan_{k}")) for k in keys)
	actual = sum(flt(row.get(f"actual_{k}")) for k in keys)
	return plan, actual


class TestWeSummaryFirstLoad(FrappeTestCase):
	def setUp(self):
		_reset()
		self.role = _ensure_role()
		fy = _fiscal_year(YEAR, MONTH_PARENT)
		project = frappe.get_doc(
			{
				"doctype": "Project",
				"name": f"{PREFIX}-PRJ",
				"project_name": f"{PREFIX} Project",
				"project_type": _project_type(),
				"custom_payment_scheme": _payment_scheme(),
				"company": _company(),
				"status": "Open",
				"expected_start_date": "2026-03-01",
				"expected_end_date": "2026-04-30",
			}
		)
		project.append("custom_ts_details", {"pt_role": self.role})
		project.insert(ignore_permissions=True)
		self.project = project.name

		parent = frappe.get_doc(
			{
				"doctype": "Task",
				"subject": f"{PREFIX} Parent",
				"status": "Open",
				"type": "Stage",
				"project": self.project,
				"is_group": 1,
				"exp_start_date": "2026-03-01",
				"exp_end_date": "2026-04-30",
			}
		).insert(ignore_permissions=True)
		self.parent = parent.name

		child = frappe.get_doc(
			{
				"doctype": "Task",
				"subject": f"{PREFIX} Child",
				"status": "Open",
				"type": "Stage",
				"project": self.project,
				"parent_task": self.parent,
				"is_group": 0,
				"exp_start_date": "2026-03-01",
				"exp_end_date": "2026-04-30",
			}
		).insert(ignore_permissions=True)
		self.child = child.name

		frappe.get_doc(
			{
				"doctype": "Project Work Efforts",
				"pwe_project": self.project,
				"pwe_task": self.parent,
				"pwe_project_role": self.role,
				"pwe_amount": [
					{
						"pwea_year": fy,
						"pwea_month": MONTH_PARENT,
						"pwea_plan": 30,
						"pwea_expected": 30,
					}
				],
			}
		).insert(ignore_permissions=True)

		self.child_pwe = frappe.get_doc(
			{
				"doctype": "Project Work Efforts",
				"pwe_project": self.project,
				"pwe_task": self.child,
				"pwe_project_role": self.role,
				"pwe_amount": [
					{
						"pwea_year": fy,
						"pwea_month": MONTH_CHILD,
						"pwea_plan": 10,
						"pwea_expected": 10,
					}
				],
			}
		).insert(ignore_permissions=True)
		self.fy = fy
		frappe.db.commit()

	def tearDown(self):
		# keep owned docs for browser smoke; reset at next setUp
		pass

	def _grid(self, include_plan):
		return run_get_work_efforts_grid(
			{
				"project": self.project,
				"period_type": "month",
				"view_options": "Только прогноз",
				"include_plan": include_plan,
			}
		)

	def test_first_load_include_plan_flag_matches_and_save_plan_survives_reload(self):
		first_hidden = self._grid(0)
		first_shown = self._grid(1)
		plan0, actual0 = _summary_totals(first_hidden)
		plan1, actual1 = _summary_totals(first_shown)

		self.assertAlmostEqual(plan0, plan1, places=2)
		self.assertAlmostEqual(actual0, actual1, places=2)
		# parent 30 (Mar) + child 10 (Apr, parent empty)
		self.assertAlmostEqual(plan0, 40.0, places=2)
		self.assertAlmostEqual(actual0, 40.0, places=2)

		child_pwe = frappe.get_doc("Project Work Efforts", self.child_pwe.name)
		for row in child_pwe.pwe_amount:
			if int(row.pwea_month) == MONTH_CHILD:
				row.pwea_expected = 15
		child_pwe.save(ignore_permissions=True)
		frappe.db.commit()

		run_save_forecast_as_plan(
			{
				"project": self.project,
				"data": json.dumps(
					[
						{
							"task": self.child,
							"role": self.role,
							"year": YEAR,
							"month": MONTH_CHILD,
							"plan_value": 15,
						}
					]
				),
			}
		)
		frappe.db.commit()

		after_save = self._grid(0)
		reload = self._grid(1)
		save_plan, save_actual = _summary_totals(after_save)
		reload_plan, reload_actual = _summary_totals(reload)

		self.assertAlmostEqual(save_plan, save_actual, places=2)
		self.assertAlmostEqual(reload_plan, save_plan, places=2)
		self.assertAlmostEqual(reload_actual, save_actual, places=2)
		self.assertAlmostEqual(reload_plan, 45.0, places=2)
