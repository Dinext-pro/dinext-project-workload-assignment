# Copyright (c) 2026, Dinext
"""Общий движок расчёта дневной нагрузки PWA (PWR, flat report)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Iterable

import frappe
from frappe.utils import add_days, getdate

from project_workload_assignment.project_workload_assignment.project_workload.types import (
	AbsenceEntry,
	DEFAULT_HOURS_ON_DATE,
	HolidayEntry,
	ProjectWorkloadInfo,
	UserWorkloadInfo,
	WORKLOAD_FIXED_HOURS,
	WORKLOAD_PERCENT_FUND,
	WORKLOAD_PERCENT_TASK,
	WorkloadAssignmentInput,
)


def _assignment_project_name(assignment: WorkloadAssignmentInput) -> str:
	return assignment.get("project_name") or assignment.get("project") or ""


@dataclass
class WorkloadContext:
	"""Контекст расчёта: справочники + кэши рабочих дней и часов."""

	users_data: dict[str, UserWorkloadInfo]
	projects_data: dict[str, ProjectWorkloadInfo]
	working_hours_overrides: dict[str, dict[str, float]]
	holiday_date_sets: dict[str, dict[str, bool]]
	user_absences: dict[str, list[AbsenceEntry]]
	monthly_plan_cache: dict[str, float]
	holiday_lists_cache: dict[str, list[HolidayEntry]] = field(default_factory=dict)
	user_daily_hours: dict[str, dict[str, float]] = field(default_factory=dict)
	_working_day_cache: dict[str, bool] = field(default_factory=dict, repr=False)

	def preload_user_base_hours(self, users_list: Iterable[str], date_strings: Iterable[str]) -> None:
		"""Предвычисление базовых часов (PWR: все даты периодов)."""
		for user_email in users_list:
			user_data = self.users_data.get(user_email, {})
			base_hours = DEFAULT_HOURS_ON_DATE
			if user_data.get("hours_on_date"):
				base_hours = float(user_data["hours_on_date"])
			working_hours_ref = user_data.get("tt_working_hours_on_date")
			override_dict = (
				self.working_hours_overrides.get(working_hours_ref, {})
				if working_hours_ref
				else {}
			)
			hours_dict = self.user_daily_hours.setdefault(user_email, {})
			for date_str in date_strings:
				hours_on_date = base_hours
				if date_str in override_dict:
					hours_on_date = override_dict[date_str]
				hours_dict[date_str] = hours_on_date

	def get_base_hours(self, user_email: str, date_str: str) -> float:
		user_hours_dict = self.user_daily_hours.get(user_email)
		if user_hours_dict and date_str in user_hours_dict:
			return user_hours_dict[date_str]

		user_data = self.users_data.get(user_email, {})
		base_hours = DEFAULT_HOURS_ON_DATE
		if user_data.get("hours_on_date"):
			base_hours = float(user_data["hours_on_date"])

		working_hours_ref = user_data.get("tt_working_hours_on_date")
		if working_hours_ref and working_hours_ref in self.working_hours_overrides:
			override_dict = self.working_hours_overrides[working_hours_ref]
			if date_str in override_dict:
				base_hours = override_dict[date_str]

		if user_email not in self.user_daily_hours:
			self.user_daily_hours[user_email] = {}
		self.user_daily_hours[user_email][date_str] = base_hours
		return base_hours

	def get_absence_hours(self, date_str: str, user_email: str) -> float:
		if user_email not in self.user_absences:
			return 0.0

		user_hours = self.get_base_hours(user_email, date_str)
		target_date = getdate(date_str)

		for absence in self.user_absences[user_email]:
			if not (absence.get("from_date") and absence.get("to_date")):
				continue
			from_date = getdate(absence["from_date"])
			to_date = getdate(absence["to_date"])
			if from_date <= target_date <= to_date:
				if target_date == from_date and absence.get("alfrom_hours"):
					return float(absence["alfrom_hours"])
				if target_date == to_date and absence.get("alto_hours"):
					return float(absence["alto_hours"])
				return user_hours
		return 0.0

	def is_working_day(self, date_str: str, user_email: str, project_name: str) -> bool:
		cache_key = f"{date_str}_{user_email}_{project_name}"
		if cache_key in self._working_day_cache:
			return self._working_day_cache[cache_key]

		project_data = self.projects_data.get(project_name, {})
		project_holiday_list = (
			project_data.get("effective_holiday_list")
			or project_data.get("holiday_list")
		)
		if project_holiday_list and project_holiday_list in self.holiday_date_sets:
			if date_str in self.holiday_date_sets[project_holiday_list]:
				self._working_day_cache[cache_key] = False
				return False

		user_data = self.users_data.get(user_email, {})
		user_holiday_list = user_data.get("wholiday_list")
		if user_holiday_list and user_holiday_list in self.holiday_date_sets:
			if date_str in self.holiday_date_sets[user_holiday_list]:
				self._working_day_cache[cache_key] = False
				return False

		if user_email in self.user_absences:
			user_hours = self.get_base_hours(user_email, date_str)
			target_date = getdate(date_str)
			for absence in self.user_absences[user_email]:
				if not (absence.get("from_date") and absence.get("to_date")):
					continue
				from_date = getdate(absence["from_date"])
				to_date = getdate(absence["to_date"])
				if from_date <= target_date <= to_date:
					absence_hours = 0.0
					if target_date == from_date and absence.get("alfrom_hours"):
						absence_hours = float(absence["alfrom_hours"])
					elif target_date == to_date and absence.get("alto_hours"):
						absence_hours = float(absence["alto_hours"])
					else:
						absence_hours = user_hours
					if absence_hours >= user_hours:
						self._working_day_cache[cache_key] = False
						return False

		self._working_day_cache[cache_key] = True
		return True

	def get_available_hours(self, date_str: str, user_email: str, project_name: str) -> float:
		if not self.is_working_day(date_str, user_email, project_name):
			return 0.0
		day_base_hours = self.get_base_hours(user_email, date_str)
		absence_hours = self.get_absence_hours(date_str, user_email)
		available = day_base_hours - absence_hours
		return max(0.0, available)

	def compute_assignment_daily_hours(
		self,
		assignment: WorkloadAssignmentInput,
		*,
		clip_from: date | None = None,
		clip_to: date | None = None,
	) -> dict[str, float]:
		"""Часы по дням для одного назначения: {date_str: hours}."""
		user_email = assignment["user"]
		project_name = _assignment_project_name(assignment)
		date_from = getdate(assignment["date_from"])
		date_to = getdate(assignment["date_to"])
		if clip_from and date_from < clip_from:
			date_from = clip_from
		if clip_to and date_to > clip_to:
			date_to = clip_to

		workload_type = assignment.get("workload")
		result: dict[str, float] = {}

		if workload_type == WORKLOAD_FIXED_HOURS:
			total_assignment_hours = float(assignment.get("wl_value") or 0)
			date_available: dict[str, float] = {}
			current_date = date_from
			while current_date <= date_to:
				date_str = str(current_date)
				available = self.get_available_hours(date_str, user_email, project_name)
				if available > 0:
					date_available[date_str] = available
				current_date = add_days(current_date, 1)

			total_available = sum(date_available.values())
			if total_available > 0:
				for date_str, available_hours in date_available.items():
					result[date_str] = total_assignment_hours * (available_hours / total_available)

		elif workload_type == WORKLOAD_PERCENT_FUND:
			percentage = float(assignment.get("wl_value") or 0) / 100.0
			current_date = date_from
			while current_date <= date_to:
				date_str = str(current_date)
				available = self.get_available_hours(date_str, user_email, project_name)
				if available > 0:
					result[date_str] = percentage * available
				current_date = add_days(current_date, 1)

		elif workload_type == WORKLOAD_PERCENT_TASK:
			role = assignment.get("role")
			if not role:
				return result
			percentage = float(assignment.get("wl_value") or 0) / 100.0
			task = assignment["task"]

			months_in_period: dict[str, dict] = {}
			current_date = date_from
			while current_date <= date_to:
				date_str = str(current_date)
				month_key = f"{current_date.year}_{current_date.month}"
				if month_key not in months_in_period:
					months_in_period[month_key] = {
						"year": current_date.year,
						"month": current_date.month,
						"working_days": 0,
						"dates": [],
					}
				months_in_period[month_key]["dates"].append(date_str)
				if self.is_working_day(date_str, user_email, project_name):
					months_in_period[month_key]["working_days"] += 1
				current_date = add_days(current_date, 1)

			for month_info in months_in_period.values():
				plan_key = (
					f"{task}_{role}_{month_info['year']}_{month_info['month']}"
				)
				monthly_plan_hours = self.monthly_plan_cache.get(plan_key)
				if not monthly_plan_hours or month_info["working_days"] <= 0:
					continue
				base_daily_hours = monthly_plan_hours / month_info["working_days"]
				for date_str in month_info["dates"]:
					if self.is_working_day(date_str, user_email, project_name):
						result[date_str] = percentage * base_daily_hours

		return result
