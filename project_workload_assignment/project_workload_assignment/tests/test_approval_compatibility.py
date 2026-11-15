import sys
from datetime import date
from importlib.util import find_spec, module_from_spec
from unittest import TestCase
from unittest.mock import patch

import frappe

from project_workload_assignment import install, legacy_absences
from project_workload_assignment.project_workload_assignment.project_workload.core.context_loaders import (
	load_user_absences,
)

LEGACY_SQL = '''def load(users, placeholders):
    absences_query = """
        SELECT `name`, `lauser`, `alfrom_date`, `alto_date`, `altype_of_leave`
        FROM `tabApplication For Leave`
        WHERE `lauser` IN (""" + placeholders + """)
        AND `status` = 'Согласовано'
        AND `alfrom_date` IS NOT NULL AND `alto_date` IS NOT NULL
    """
    absences = frappe.db.sql(absences_query, users, as_dict=True)
    return absences
'''

APPROVED_ONLY = """def load(users, placeholders):
    absences = frappe.get_all(
        "Application For Leave",
        fields=["name", "lauser", "alfrom_date", "alto_date", "altype_of_leave"],
        filters={
            "lauser": ["in", users],
            "status": "Approved",
            "alfrom_date": ["is", "set"],
            "alto_date": ["is", "set"],
        },
        limit_page_length=0,
    )
    return absences
"""


class TestApprovalCompatibility(TestCase):
	def test_readers_import_with_timesheets_develop(self):
		package = "project_workload_assignment.project_workload_assignment"
		for reader in (
			"project_workload.utilization.utp_actual",
			"work_efforts.consolidated_data",
			"work_efforts.work_efforts_progress",
		):
			with (
				self.subTest(reader=reader),
				patch.dict(sys.modules, {"dinext_timesheets.timesheet_status": None}),
			):
				spec = find_spec(f"{package}.{reader}")
				spec.loader.exec_module(module_from_spec(spec))

	def test_native_absence_report_queries_both_approved_values_and_preserves_period_filters(self):
		with patch.object(frappe.qb, "get_query") as query:
			query.return_value.run.return_value = [
				frappe._dict(
					lauser="worker",
					alfrom_date="2026-11-10",
					alto_date="2026-11-12",
					altype_of_leave="Vacation",
					alfrom_hours=4,
					alto_hours=8,
				),
			]
			result = load_user_absences(["worker"], min_end_date="2026-11-09")

		filters = query.call_args.kwargs["filters"]
		status = next(row for row in filters if row[0] == "status")
		self.assertEqual(status[1], "in")
		self.assertCountEqual(status[2], ["Согласовано", "Approved"])
		self.assertIn(["alto_date", ">=", date(2026, 11, 9)], filters)
		self.assertEqual(result["worker"][0]["alfrom_hours"], 4)

	def test_guarded_legacy_migration_accepts_original_and_earlier_rewrite(self):
		for source in (LEGACY_SQL, APPROVED_ONLY):
			with self.subTest(source=source.splitlines()[1]):
				record = frappe._dict(
					disabled=0, api_method="get_projects_workload_data", script_type="API", script=source
				)

				def set_script(doctype, name, field, value, *, update_modified):
					self.assertEqual(
						(doctype, name, field), ("Server Script", "Get Projects Workload Data", "script")
					)
					record.script = value

				with (
					patch.object(frappe.db, "get_value", return_value=record) as read,
					patch.object(frappe.db, "set_value", side_effect=set_script),
				):
					self.assertIsNotNone(legacy_absences.plan_legacy_absence_query())
					self.assertEqual(record.script, source)
					legacy_absences.migrate_legacy_absence_query()
					self.assertTrue(read.call_args.kwargs["for_update"])
					self.assertIsNone(legacy_absences.plan_legacy_absence_query())

				def get_all(doctype, *, fields, filters, limit_page_length):
					self.assertEqual(doctype, "Application For Leave")
					self.assertCountEqual(
						fields, ["name", "lauser", "alfrom_date", "alto_date", "altype_of_leave"]
					)
					self.assertEqual(limit_page_length, 0)
					self.assertEqual(filters["lauser"], ["in", ["worker"]])
					self.assertEqual(filters["alfrom_date"], ["is", "set"])
					self.assertEqual(filters["alto_date"], ["is", "set"])
					operator, values = filters["status"]
					self.assertEqual(operator, "in")
					return [status for status in ("Согласовано", "Approved", "Rejected") if status in values]

				namespace = {"frappe": frappe._dict(get_all=get_all)}
				exec(record.script, namespace)
				self.assertEqual(namespace["load"](["worker"], "%s"), ["Согласовано", "Approved"])

	def test_guarded_legacy_migration_stops_on_an_unrecognized_active_query(self):
		modified = APPROVED_ONLY.replace('"alfrom_date": ["is", "set"]', '"alfrom_date": [">", "2026-01-01"]')
		record = frappe._dict(
			disabled=0, api_method="get_projects_workload_data", script_type="API", script=modified
		)

		def read_script(*args, as_dict=False, **kwargs):
			return record if as_dict else record.script

		with (
			patch.object(frappe.db, "get_value", side_effect=read_script),
			patch.object(frappe.db, "set_value") as write,
			self.assertRaisesRegex(ValueError, "Get Projects Workload Data"),
		):
			legacy_absences.migrate_legacy_absence_query()
		write.assert_not_called()

	def test_ordinary_migration_does_not_inspect_or_change_the_legacy_script(self):
		with (
			patch.object(legacy_absences, "migrate_legacy_absence_query") as migrate,
			patch.object(install, "ensure_report_indexes"),
			patch.object(frappe, "clear_cache"),
		):
			install.after_migrate()
		migrate.assert_not_called()
