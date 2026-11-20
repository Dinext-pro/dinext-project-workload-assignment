"""The same assignment rules serve the form, the bulk dialogs and Python callers."""

import unittest
from unittest.mock import MagicMock, patch

import frappe
from frappe.utils import CallbackManager

from project_workload_assignment.project_workload_assignment.doctype.project_workload_assignment.project_workload_assignment import (
	ProjectWorkloadAssignment,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.types import (
	WORKLOAD_FIXED_HOURS,
	WORKLOAD_PERCENT_FUND,
	WORKLOAD_PERCENT_TASK,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.workload_engine import (
	WorkloadContext,
)
from project_workload_assignment.pwa_dates import validation
from project_workload_assignment.pwa_dates.bulk import bulk_process_pwa
from project_workload_assignment.pwa_dates.issue_sync import sync_issue_dates_to_pwa
from project_workload_assignment.pwa_dates.task_sync import sync_task_dates_to_pwa


def assignment(**fields):
	row = frappe._dict(
		name="PWA-1",
		task="T",
		user="U",
		role="R",
		task_dates=0,
		date_from="2026-04-01",
		date_to="2026-04-03",
		workload=WORKLOAD_PERCENT_FUND,
		wl_value=50,
	)
	row.update(fields)
	return row


def member(start=None, end=None, **fields):
	row = dict(pt_participant="U", pt_role="R", pt_valid_from=start, pt_valid_for=end, workload_limit=100)
	row.update(fields)
	return row


class AssignmentValidationTest(unittest.TestCase):
	def setUp(self):
		self.enterContext(patch.object(frappe.local, "flags", frappe._dict(in_test=False), create=True))
		self.members = [member()]
		self.neighbours = []
		self.calendar = WorkloadContext(
			{"U": {"hours_on_date": 8}},
			{"P": {"holiday_list": "H"}},
			{},
			{"H": {"2026-04-02": True}},
			{"U": [dict(from_date="2026-04-03", to_date="2026-04-03", alfrom_hours=4)]},
			{},
		)
		for target, result in (
			("load_team_capacity_rows", self.members),
			("_calendar", self.calendar),
			("_task", {"project": "P", "exp_start_date": None, "exp_end_date": None}),
		):
			self.enterContext(patch.object(validation, target, return_value=result))
		self.fetch_neighbours = self.enterContext(
			patch.object(
				validation,
				"fetch_flat_report_assignments",
				side_effect=lambda start, end, *, user, project=None: [
					row
					for row in self.neighbours
					if row.user == user and (not project or row.project == project)
				],
			)
		)
		self.enterContext(patch.object(validation, "_", side_effect=lambda s: s))
		self.enterContext(
			patch.object(
				frappe, "throw", side_effect=lambda msg: (_ for _ in ()).throw(frappe.ValidationError(msg))
			)
		)
		self.enterContext(
			patch.object(
				frappe,
				"get_meta",
				return_value=MagicMock(has_field=lambda key: key in assignment() and key != "name"),
			)
		)
		self.alert = self.enterContext(patch.object(frappe, "msgprint"))

	def _validate(self, row, previous=None):
		doc = MagicMock()
		doc.get.side_effect = row.get
		doc.get_doc_before_save.return_value = previous
		ProjectWorkloadAssignment.validate(doc)
		return doc

	def test_adjacent_open_memberships_and_parent_dates(self):
		self.members[:] = [member(end="2026-04-01"), member(start="2026-04-02")]
		self._validate(assignment())
		self._validate(assignment(task_dates=1, date_from=None, date_to=None))
		self.alert.assert_not_called()

	def test_missing_inherited_dates_use_task_and_gate_membership(self):
		self.members[:] = [member(start="2026-04-02")]
		task = dict(project="P", exp_start_date="2026-04-01", exp_end_date="2026-04-03")
		with patch.object(validation, "_task", return_value=task), self.assertRaises(frappe.ValidationError):
			self._validate(assignment(task_dates=1, date_from=None, date_to=None))

	def test_parent_sync_can_clear_inherited_date(self):
		row = assignment(task_dates=1, date_from=None)
		doc = MagicMock()
		doc.get.side_effect = row.get
		doc.get_doc_before_save.return_value = assignment(task_dates=1)
		doc.save.side_effect = lambda **kwargs: ProjectWorkloadAssignment.validate(doc)
		task = dict(project="P", exp_start_date="2026-04-01", exp_end_date="2026-04-03")
		with patch.object(validation, "_task", return_value=task):
			validation.save_parent_dates(doc)
		doc.set.assert_not_called()

	def test_task_and_issue_can_reschedule_legacy_but_direct_and_bulk_edits_still_validate(self):
		for doctype, sync, start_field, end_field, team in (
			("Task", sync_task_dates_to_pwa, "exp_start_date", "exp_end_date", []),
			(
				"Issue",
				sync_issue_dates_to_pwa,
				"opening_date",
				"custom_expected_resolution_date",
				[member(end="2026-04-03")],
			),
		):
			with self.subTest(doctype=doctype):
				self.members[:] = team
				before = assignment(task_dates=1)
				pwa = frappe._dict(before)
				pwa.get_doc_before_save = lambda: before
				pwa.set = pwa.__setitem__
				pwa.save = MagicMock(side_effect=lambda **kwargs: ProjectWorkloadAssignment.validate(pwa))
				parent = frappe._dict(name="T" if doctype == "Task" else "ISS", flags=frappe._dict())
				parent[start_field], parent[end_field] = before.date_from, "2026-04-15"
				parent.get_doc_before_save = lambda: {
					start_field: before.date_from,
					end_field: before.date_to,
				}
				records = (
					[[{"name": pwa.name}]] if doctype == "Task" else [[{"name": "T"}], [{"name": pwa.name}]]
				)
				db = MagicMock()
				db.get_value.return_value = None
				with (
					patch.object(frappe, "db", db),
					patch.object(frappe, "get_all", side_effect=records),
					patch.object(frappe, "get_doc", return_value=pwa),
				):
					sync(parent)
					self.assertEqual(pwa.date_to, "2026-04-15")
					pwa.save.assert_called_once_with(ignore_permissions=True)
					with self.assertRaises(frappe.ValidationError):
						ProjectWorkloadAssignment.validate(pwa)
					with self.assertRaises(frappe.ValidationError):
						bulk_process_pwa([dict(before, date_to="2026-04-15")])

	def test_wrong_role_user_virtual_and_date_gap(self):
		for rows in (
			[member(pt_role="X")],
			[member(pt_participant="X")],
			[member(virtual_worker=1)],
			[member(end="2026-04-01"), member(start="2026-04-03")],
		):
			with self.subTest(rows=rows):
				self.members[:] = rows
				with self.assertRaises(frappe.ValidationError):
					self._validate(assignment())

	def test_reversed_and_missing_manual_dates(self):
		for dates in ({"date_from": None}, {"date_to": "2026-03-30"}):
			with self.subTest(dates=dates), self.assertRaises(frappe.ValidationError):
				self._validate(assignment(**dates))

	def test_legacy_unchanged_allowed(self):
		self.members.clear()
		row = assignment(role="OLD", date_from=None, wl_value="50.00")
		self._validate(row, previous=assignment(role="OLD", date_from=None, wl_value=50))

	def test_calendar_and_summed_hours_warn_without_blocking(self):
		self.neighbours.append(
			assignment(name="other", project="P", workload=WORKLOAD_FIXED_HOURS, wl_value=6)
		)
		self._validate(assignment(wl_value=50))
		self.alert.assert_not_called()
		self._validate(assignment(wl_value=75))
		self.assertEqual(self.alert.call_count, 1)
		self.assertIn("2026-04-01", self.alert.call_args.args[0])
		self.assertNotIn("2026-04-02", self.alert.call_args.args[0])

	def test_project_calendars_and_employee_fund_across_projects(self):
		# Different project holidays leave Friday as the only shared workday.
		# The employee has four hours available on Friday. 60% + 60% = 4.8 h.
		self.calendar.projects_data["Q"] = {"holiday_list": "Q holidays"}
		self.calendar.holiday_date_sets["Q holidays"] = {"2026-04-01": True}
		self.neighbours.append(assignment(name="elsewhere", project="Q", wl_value=60))
		self._validate(assignment(wl_value=60))
		self.alert.assert_called_once()
		message = self.alert.call_args.args[0]
		self.assertIn("across projects", message)
		self.assertIn("2026-04-03", message)
		self.assertNotIn("Q", message)
		self.assertNotIn("project", self.fetch_neighbours.call_args.kwargs)

	def test_workload_provider_hook_is_lazy(self):
		from project_workload_assignment import hooks

		self.assertIn(
			"dinext_demo.generators.effort.WORKLOAD_PROVIDER", getattr(hooks, "dinext_demo_generators", ())
		)

	def test_missing_task_plan_is_advisory(self):
		self._validate(assignment(workload=WORKLOAD_PERCENT_TASK))
		self.alert.assert_called_once()
		self.assertIn("Work efforts", self.alert.call_args.args[0])

	def test_final_bulk_load_after_removal_and_updates(self):
		old = assignment(name="old", project="P", wl_value=90)
		self.neighbours.append(old)

		def load_doc(*args):
			doc = MagicMock()
			if isinstance(args[0], dict):
				row = frappe._dict(args[0])
				row.name = "new"
				doc.insert.side_effect = lambda **kwargs: self._validate(row)
			else:
				doc.delete.side_effect = self.neighbours.clear
			return doc

		with (
			patch.object(frappe, "db", MagicMock()),
			patch.object(frappe, "get_doc", side_effect=load_doc),
			patch("project_workload_assignment.pwa_dates.bulk._sync_assignments") as sync,
		):
			bulk_process_pwa([dict(assignment(wl_value=80), __islocal=True), dict(old, __isRemove=True)])
			sync.assert_called_once()
		self.alert.assert_not_called()

	def test_late_todo_failure_restores_callbacks_and_database_savepoint(self):
		db = MagicMock()
		for name in ("before_commit", "after_commit", "before_rollback", "after_rollback"):
			setattr(db, name, CallbackManager())
		original = MagicMock()
		cancelled = MagicMock()
		db.after_commit.add(original)

		def fail_sync(*args):
			db.after_commit.add(cancelled)
			frappe.local._realtime_log.append("rolled-back")
			frappe.local._webhook_queue.append("rolled-back")
			raise RuntimeError("ToDo failed")

		with (
			patch.object(frappe, "db", db),
			patch.object(frappe.local, "_realtime_log", ["existing"], create=True),
			patch.object(frappe.local, "_webhook_queue", ["original event"], create=True),
			patch("project_workload_assignment.pwa_dates.bulk._sync_assignments", side_effect=fail_sync),
		):
			with self.assertRaisesRegex(RuntimeError, "ToDo failed"):
				bulk_process_pwa([{"task": "T", "__islocal": True, "__isRemove": True}])
			self.assertEqual(frappe.local._realtime_log, ["existing"])
			self.assertEqual(frappe.local._webhook_queue, ["original event"])
			db.rollback.assert_called_once_with(save_point=db.savepoint.call_args.args[0])
			db.after_commit.run()
		original.assert_called_once()
		cancelled.assert_not_called()

	def test_bulk_rejects_second_row_rolls_back_first_before_todo_sync(self):
		db = MagicMock()
		docs = []

		def new_doc(fields):
			row = frappe._dict(fields)
			row.name = "new-" + row.role
			doc = MagicMock()
			doc.insert.side_effect = lambda **kwargs: self._validate(row)
			docs.append(doc)
			return doc

		with (
			patch.object(frappe, "db", db),
			patch.object(frappe, "get_doc", side_effect=new_doc),
			patch("project_workload_assignment.pwa_dates.bulk._sync_assignments") as sync,
		):
			with self.assertRaises(frappe.ValidationError):
				bulk_process_pwa([dict(assignment(role=role), __islocal=True) for role in ("R", "BAD")])
			self.assertEqual(len(docs), 2)
			db.rollback.assert_called_once_with(save_point=db.savepoint.call_args.args[0])
			sync.assert_not_called()
