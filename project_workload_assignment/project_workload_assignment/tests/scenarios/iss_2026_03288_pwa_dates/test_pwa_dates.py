# Copyright (c) 2026, Dinext and contributors
# See license.txt
"""ISS-2026-03288 live-site scenario. Port of ISS-2025-02606 after SS → app hooks."""

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import getdate

from .data_setup import (
    VIRTUAL_TASK_ACT_END,
    VIRTUAL_TASK_ACT_START,
    WIDE_FACT_ROWS,
    build_issue_without_virtual_task_pwa_scenario,
    build_regular_task_pwa_scenario,
    build_virtual_task_pwa_scenario,
    change_position_status,
    save_issue_via_doctype_hooks,
    reset_scenario,
)


class TestIss202603288PwaDates(FrappeTestCase):
    @classmethod
    def tearDownClass(cls):
        reset_scenario()
        super().tearDownClass()

    def setUp(self):
        reset_scenario()

    def test_task_pwa_receives_final_expected_dates_after_regular_fact_sync(self):
        bundle = build_regular_task_pwa_scenario(primary_rows=WIDE_FACT_ROWS)

        change_position_status(bundle["wide_position"], "Согласовано")

        task = frappe.get_doc("Task", bundle["task"])
        pwa_doc = frappe.get_doc("Project Workload Assignment", bundle["pwa"])

        self.assertEqual(getdate(WIDE_FACT_ROWS[0][0]), task.exp_start_date)
        self.assertEqual(getdate(WIDE_FACT_ROWS[1][0]), task.exp_end_date)
        self.assertEqual(task.exp_start_date, pwa_doc.date_from)
        self.assertEqual(task.exp_end_date, pwa_doc.date_to)

    def test_issue_without_virtual_task_updates_issue_linked_task_pwa(self):
        bundle = build_issue_without_virtual_task_pwa_scenario()

        save_issue_via_doctype_hooks(
            bundle["issue"],
            opening_date="2026-04-10",
            custom_expected_resolution_date="2026-04-16",
        )

        pwa_doc = frappe.get_doc("Project Workload Assignment", bundle["pwa"])

        self.assertEqual(getdate("2026-04-10"), pwa_doc.date_from)
        self.assertEqual(getdate("2026-04-16"), pwa_doc.date_to)

    def test_virtual_task_pwa_receives_final_task_dates_not_raw_issue_dates(self):
        bundle = build_virtual_task_pwa_scenario()
        frappe.db.set_value(
            "Task",
            bundle["virtual_task"],
            {
                "act_start_date": VIRTUAL_TASK_ACT_START,
                "act_end_date": VIRTUAL_TASK_ACT_END,
            },
            update_modified=False,
        )

        save_issue_via_doctype_hooks(
            bundle["issue"],
            custom_expected_resolution_date="2026-04-16",
        )

        virtual_task = frappe.get_doc("Task", bundle["virtual_task"])
        pwa_doc = frappe.get_doc("Project Workload Assignment", bundle["pwa"])

        self.assertEqual(getdate(VIRTUAL_TASK_ACT_START), virtual_task.exp_start_date)
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_END), virtual_task.exp_end_date)
        self.assertEqual(virtual_task.exp_start_date, pwa_doc.date_from)
        self.assertEqual(virtual_task.exp_end_date, pwa_doc.date_to)
        self.assertNotEqual(getdate("2026-04-16"), pwa_doc.date_to)
