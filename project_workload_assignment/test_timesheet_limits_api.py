"""Native workflows and both HTTP aliases use the same limits calculator."""

import unittest
from unittest.mock import patch

import frappe

from project_workload_assignment import api


class TestTimesheetLimitsAPI(unittest.TestCase):
	def test_native_arguments_are_independent_of_http_overrides(self):
		form = frappe._dict(
			positions=[], timesheet_name="HTTP", project_limits=[{"type": "warning", "limit": 75}]
		)
		native = [{"name": "P", "project_role": "QA", "all_hours": 8}]
		with (
			patch.object(frappe, "form_dict", form),
			patch.object(frappe.local, "flags", frappe._dict(in_test=False), create=True),
			patch.object(api.TimesheetLimitsCalculator, "run", return_value=[{"status": "warning"}]) as calc,
		):
			self.assertEqual(api.calculate_timesheet_limits_for(native, "PY"), [{"status": "warning"}])
			calc.assert_called_once_with({"positions": native, "timesheet_name": "PY"})
			api.calculate_timesheet_limits_for(native)
			calc.assert_called_with({"positions": native, "timesheet_name": None})
			for endpoint in (api.calculate_timesheet_limits, api.calculate_user_timesheet_limits):
				endpoint()
				self.assertIs(calc.call_args.args[0], form)
