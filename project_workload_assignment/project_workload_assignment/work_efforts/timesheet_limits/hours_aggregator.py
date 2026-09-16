# Copyright (c) 2026, Dinext
"""UTP fact aggregation for timesheet limit checks."""

from __future__ import annotations

import frappe

from project_workload_assignment.project_workload_assignment.work_efforts.models import (
	HoursData,
	TimesheetPositionInput,
)
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.parsing import (
	LimitsParsing,
)


class TimesheetHoursAggregator:
	@classmethod
	def aggregate(
		cls,
		tasks: list[str],
		role: str,
		timesheet_name: str | None,
		timesheet_status: str | None,
		local_positions: list[TimesheetPositionInput],
		*,
		year: int | None = None,
		month: int | None = None,
		cache: dict | None = None,
	) -> HoursData:
		hours_cache = cache if cache is not None else {}
		ck = f"{role}|{','.join(sorted(tasks))}"
		if year is not None:
			ck += f"_{year}_{month}"
		if ck in hours_cache:
			return hours_cache[ck]

		if year is not None and month is not None:
			total = cls._from_grid_positions(
				tasks, role, year, month, local_positions
			)
			hours_cache[ck] = total
			return total

		total = cls._from_utp_db(
			tasks,
			role,
			timesheet_name,
			timesheet_status,
			local_positions,
		)
		hours_cache[ck] = total
		return total

	@classmethod
	def _from_grid_positions(
		cls,
		tasks: list[str],
		role: str,
		year: int,
		month: int,
		local_positions: list[TimesheetPositionInput],
	) -> HoursData:
		task_set = set(tasks)
		total: HoursData = {"total": 0}
		users: set[str] = set()
		for pos in local_positions:
			pos_task = pos.get("document_name")
			pos_role = pos.get("project_role", "")
			pos_year = LimitsParsing.as_int(pos.get("year"))
			pos_month = LimitsParsing.as_int(pos.get("month"))
			if (
				pos_task in task_set
				and pos_role == role
				and pos_year == year
				and pos_month == month
			):
				hrs = frappe.utils.flt(pos.get("all_hours", 0))
				total["total"] = total.get("total", 0) + hrs
				total[pos.get("status", "")] = total.get(pos.get("status", ""), 0) + hrs
				users.add(pos.get("custom_username", ""))
		total["users"] = users
		return total

	@classmethod
	def _from_utp_db(
		cls,
		tasks: list[str],
		role: str,
		timesheet_name: str | None,
		timesheet_status: str | None,
		local_positions: list[TimesheetPositionInput],
	) -> HoursData:
		filters: dict[str, object] = {"document_name": ["in", tasks], "project_role": role}
		if timesheet_name:
			filters["user_timesheet"] = ["!=", timesheet_name]

		db_rows = frappe.db.get_all(
			"User Timesheet Position",
			filters=filters,
			fields=["all_hours", "status", "document_name", "custom_username"],
		)

		timesheet_owner_name = cls._timesheet_owner_name(timesheet_name)

		total: HoursData = {}
		users: set[str] = set()
		user_hours: dict[str, dict[str, float]] = {}
		for r in db_rows:
			hrs = frappe.utils.flt(r.all_hours or 0.0)
			total["total"] = total.get("total", 0.0) + hrs
			total[r.status] = total.get(r.status, 0.0) + hrs
			if r.custom_username:
				users.add(r.custom_username)
				bucket = user_hours.setdefault(r.custom_username, {})
				bucket[r.status] = bucket.get(r.status, 0.0) + hrs

		if timesheet_name and timesheet_status:
			for pos in local_positions:
				task = pos.get("document_name")
				task_role = pos.get("project_role", "")
				local_hours = pos.get("all_hours")
				local_user = timesheet_owner_name or pos.get("custom_username")
				if local_user:
					users.add(local_user)
				if task in tasks and role == task_role and local_hours:
					hrs = frappe.utils.flt(local_hours)
					total["total"] = total.get("total", 0.0) + hrs
					total[timesheet_status] = total.get(timesheet_status, 0.0) + hrs
					if local_user:
						bucket = user_hours.setdefault(local_user, {})
						bucket[timesheet_status] = bucket.get(timesheet_status, 0.0) + hrs

		total["user_hours"] = user_hours
		total["users"] = users
		return total

	@staticmethod
	def _timesheet_owner_name(timesheet_name: str | None) -> str | None:
		if not timesheet_name:
			return None
		timesheet_owner_email = frappe.db.get_value(
			"User Timesheet", timesheet_name, "timesheet_from"
		)
		if not timesheet_owner_email:
			return None
		return frappe.db.get_value("User", timesheet_owner_email, "full_name")
