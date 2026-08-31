# Copyright (c) 2026, Dinext
"""ISS-2026-02657: календарь строки проекта = Project HL, иначе Company."""

from __future__ import annotations

import frappe
from frappe.tests.utils import FrappeTestCase

from project_workload_assignment.project_workload_assignment.project_workload.canonical.reshape import (
	_adapt_project_row,
	run_team_workload_grid_canonical,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.context_loaders import (
	load_projects,
	resolve_project_holiday_list,
)


class TestProjectHolidayList(FrappeTestCase):
	def test_resolve_prefers_project_holiday_list(self):
		self.assertEqual(
			resolve_project_holiday_list(
				{"holiday_list": "HL-P", "company": "C", "effective_holiday_list": "HL-C"},
				{"C": "HL-C"},
			),
			"HL-P",
		)

	def test_resolve_company_fallback(self):
		self.assertEqual(
			resolve_project_holiday_list(
				{"holiday_list": None, "company": "C"},
				{"C": "HL-C"},
			),
			"HL-C",
		)

	def test_resolve_effective_when_company_map_missing(self):
		self.assertEqual(
			resolve_project_holiday_list(
				{
					"holiday_list": None,
					"company": "C",
					"effective_holiday_list": "HL-C",
				}
			),
			"HL-C",
		)

	def test_resolve_empty(self):
		self.assertIsNone(resolve_project_holiday_list(None))
		self.assertIsNone(resolve_project_holiday_list({"holiday_list": None, "company": "C"}))

	def test_adapt_project_row_drops_user_holidays(self):
		legacy = {
			"_project": "PRJ-1",
			"_email": "a@x",
			"project": "Demo",
			"_userHolidays": [{"date": "2026-08-29", "description": "User"}],
			"_projectHolidays": [{"date": "2026-08-30", "description": "Project"}],
		}
		row = _adapt_project_row(legacy, [], "a@x")
		self.assertEqual(row["kind"], "project")
		self.assertEqual(row["projectHolidays"], [{"date": "2026-08-30", "description": "Project"}])
		self.assertNotIn("userHolidays", row)

	def _live_assignment_with_company_hl(self):
		rows = frappe.db.sql(
			"""
			select
				pwa.user as user,
				pwa.date_from as date_from,
				p.name as project,
				p.holiday_list as original_hl,
				p.company as company,
				c.default_holiday_list as company_hl
			from `tabProject Workload Assignment` pwa
			inner join `tabTask` t on t.name = pwa.task
			inner join `tabProject` p on p.name = t.project
			inner join `tabCompany` c on c.name = p.company
			where ifnull(pwa.user, '') != ''
			  and ifnull(p.company, '') != ''
			order by pwa.modified desc
			limit 1
			""",
			as_dict=True,
		)
		if not rows:
			return None
		row = rows[0]
		company_hl = row.company_hl
		if not company_hl:
			company_hl = frappe.db.sql(
				"""
				select parent
				from `tabHoliday`
				where parenttype = 'Holiday List' and parentfield = 'holidays'
				limit 1
				""",
			)
			company_hl = company_hl[0][0] if company_hl else None
		if not company_hl:
			return None
		if not row.company_hl:
			frappe.db.set_value(
				"Company",
				row.company,
				"default_holiday_list",
				company_hl,
				update_modified=False,
			)
		return frappe._dict(
			project=row.project,
			company=row.company,
			company_hl=company_hl,
			user=row.user,
			anchor=str(row.date_from)[:10] if row.date_from else None,
			original_hl=row.original_hl or "",
		)

	def test_live_load_projects_falls_back_to_company_hl(self):
		sample = self._live_assignment_with_company_hl()
		if not sample:
			self.skipTest("No PWA whose Project.company has default_holiday_list")

		frappe.db.set_value("Project", sample.project, "holiday_list", "", update_modified=False)

		info = (load_projects([sample.project]) or {}).get(sample.project) or {}
		self.assertFalse(info.get("holiday_list"))
		self.assertEqual(info.get("effective_holiday_list"), sample.company_hl)
		self.assertEqual(resolve_project_holiday_list(info), sample.company_hl)

	def test_live_user_projects_row_uses_company_not_worker_calendar(self):
		sample = self._live_assignment_with_company_hl()
		if not sample:
			self.skipTest("No PWA whose Project.company has default_holiday_list")

		frappe.db.set_value("Project", sample.project, "holiday_list", "", update_modified=False)

		worker_hl = frappe.db.get_value("Worker", {"wuser": sample.user}, "wholiday_list")
		company_dates = {
			str(d[0])
			for d in frappe.db.sql(
				"""
				select holiday_date
				from `tabHoliday`
				where parent = %s
				  and parenttype = 'Holiday List'
				  and parentfield = 'holidays'
				""",
				sample.company_hl,
			)
		}
		self.assertTrue(company_dates, f"{sample.company_hl} has no Holiday rows")

		args = {
			"mode": "user_projects",
			"detail_user": sample.user,
			"view_type": "weekly",
			"period_range": "quarter",
		}
		if sample.anchor:
			args["period_anchor_date"] = sample.anchor

		result = run_team_workload_grid_canonical(args)
		self.assertFalse(result.get("error"), result.get("error"))
		project_rows = [
			row
			for row in (result.get("rows") or [])
			if row.get("kind") == "project" and row.get("project") == sample.project
		]
		self.assertTrue(
			project_rows,
			f"user_projects {sample.user} has no row for {sample.project}",
		)

		prow = project_rows[0]
		self.assertNotIn("userHolidays", prow)
		row_dates = {str(item.get("date")) for item in (prow.get("projectHolidays") or [])}
		self.assertTrue(row_dates, "project row got empty projectHolidays after company fallback")
		self.assertTrue(row_dates <= company_dates)

		if worker_hl and worker_hl != sample.company_hl:
			worker_only = {
				str(d[0])
				for d in frappe.db.sql(
					"""
					select holiday_date
					from `tabHoliday`
					where parent = %s
					  and parenttype = 'Holiday List'
					  and parentfield = 'holidays'
					""",
					worker_hl,
				)
			} - company_dates
			self.assertFalse(row_dates & worker_only)

