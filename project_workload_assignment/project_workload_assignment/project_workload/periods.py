# Copyright (c) 2026, Dinext
"""Вспомогательные функции по периодам Project Workload."""

from typing import TypedDict
from datetime import date

import frappe


# ==================== TypedDict определения ====================

class PWRPeriodDaily(TypedDict):
	"""Дневной период для отчёта PWR."""
	key: str
	date: str
	year: int
	month: int
	day: int
	weekday: int


class PWRPeriodWeekly(TypedDict):
	"""Недельный период для отчёта PWR."""
	key: str
	year: int
	week: int
	start_date: str
	end_date: str


class PWRPeriodMonthly(TypedDict):
	"""Месячный период для отчёта PWR."""
	key: str
	year: int
	month: int
	start_date: str
	end_date: str


PWRPeriod = PWRPeriodDaily | PWRPeriodWeekly | PWRPeriodMonthly


def build_date_to_period_key(periods: list[PWRPeriod], view_type: str) -> dict[str, str]:
	"""ISS-2026-00865: O(1) date -> period lookup without changing period payload."""
	result: dict[str, str] = {}
	for period in periods:
		if view_type == 'daily':
			result[period['date']] = period['key']
		else:
			current_date = frappe.utils.getdate(period['start_date'])
			end_date = frappe.utils.getdate(period['end_date'])
			while current_date <= end_date:
				result[str(current_date)] = period["key"]
				current_date = frappe.utils.add_days(current_date, 1)
	return result


def generate_periods_for_pwr_report(view_type: str, period_range: str) -> list[PWRPeriod]:
	"""Сетка периодов для отчёта PWR V2 (как в Server Script Get Projects Workload Data_Exp_V2)."""
	periods: list[PWRPeriod] = []
	today = frappe.utils.nowdate()
	current_date_obj = frappe.utils.getdate(today)

	if view_type == 'daily':
		days_count = 90
		if period_range == 'half_year':
			days_count = 180
		elif period_range == 'year':
			days_count = 365
		for i in range(days_count):
			date_str = frappe.utils.add_days(today, i)
			date_obj = frappe.utils.getdate(date_str)
			periods.append(
				PWRPeriodDaily(
					key='workload_' + date_str,
					date=date_str,
					year=date_obj.year,
					month=date_obj.month,
					day=date_obj.day,
					weekday=date_obj.weekday(),
				)
			)
	elif view_type == 'weekly':
		weeks_count = 13
		if period_range == 'half_year':
			weeks_count = 26
		elif period_range == 'year':
			weeks_count = 52
		week_start = frappe.utils.add_days(today, -current_date_obj.weekday())
		for i in range(weeks_count):
			week_start_date = frappe.utils.add_days(week_start, i * 7)
			week_end_date = frappe.utils.add_days(week_start_date, 6)
			week_start_obj = frappe.utils.getdate(week_start_date)
			periods.append(
				PWRPeriodWeekly(
					key='workload_' + str(week_start_obj.year) + '_week_' + str(i + 1),
					year=week_start_obj.year,
					week=i + 1,
					start_date=str(week_start_date),
					end_date=str(week_end_date),
				)
			)
	else:
		months_count = 3
		if period_range == 'half_year':
			months_count = 6
		elif period_range == 'year':
			months_count = 12
		for i in range(months_count):
			total_month = current_date_obj.month + i
			year = current_date_obj.year
			month = total_month
			if total_month > 12:
				year = year + 1
				month = total_month - 12
			month_str = str(month)
			if len(month_str) == 1:
				month_str = '0' + month_str
			start_date = frappe.utils.get_first_day(str(year) + '-' + month_str + '-01')
			end_date = frappe.utils.get_last_day(start_date)
			periods.append(
				PWRPeriodMonthly(
					key='workload_' + str(year) + '_' + str(month),
					year=year,
					month=month,
					start_date=str(start_date),
					end_date=str(end_date),
				)
			)

	return periods


def generate_periods_for_project_window(
	date_from: str | date,
	date_to: str | date,
	view_type: str,
) -> list[PWRPeriod]:
	"""Периоды для вкладки «Загрузка» проекта (паритет с single_project_workload_tree)."""
	start_date_obj = frappe.utils.getdate(date_from)
	end_date_obj = frappe.utils.getdate(date_to)
	if start_date_obj > end_date_obj:
		start_date_obj, end_date_obj = end_date_obj, start_date_obj

	max_days = min(365, (end_date_obj - start_date_obj).days + 1)
	if max_days < 1:
		return []

	periods: list[PWRPeriod] = []

	if view_type == "daily":
		current_date = start_date_obj
		for _i in range(max_days):
			if current_date > end_date_obj:
				break
			date_str = str(current_date)
			periods.append(
				PWRPeriodDaily(
					key="workload_" + date_str,
					date=date_str,
					year=current_date.year,
					month=current_date.month,
					day=current_date.day,
					weekday=current_date.weekday(),
				)
			)
			current_date = frappe.utils.add_days(current_date, 1)

	elif view_type == "weekly":
		current_date = start_date_obj
		days_to_monday = current_date.weekday()
		week_start = frappe.utils.getdate(frappe.utils.add_days(current_date, -days_to_monday))
		days_diff = (end_date_obj - week_start).days
		weeks_count = (days_diff // 7) + 1
		for i in range(weeks_count):
			week_start_date = frappe.utils.add_days(week_start, i * 7)
			week_end_date = frappe.utils.add_days(week_start_date, 6)
			week_start_obj = frappe.utils.getdate(week_start_date)
			periods.append(
				PWRPeriodWeekly(
					key=f"workload_{week_start_obj.year}-W{week_start_obj.isocalendar()[1]:02d}",
					year=week_start_obj.year,
					week=week_start_obj.isocalendar()[1],
					start_date=str(week_start_date),
					end_date=str(week_end_date),
				)
			)
			if len(periods) > 156:
				break

	else:
		month_start = frappe.utils.getdate(f"{start_date_obj.year}-{start_date_obj.month:02d}-01")
		while month_start <= end_date_obj:
			month_end = frappe.utils.get_last_day(month_start)
			periods.append(
				PWRPeriodMonthly(
					key=f"workload_{month_start.year}-{month_start.month:02d}",
					year=month_start.year,
					month=month_start.month,
					start_date=str(month_start),
					end_date=str(month_end),
				)
			)
			if month_start.month == 12:
				month_start = frappe.utils.getdate(f"{month_start.year + 1}-01-01")
			else:
				month_start = frappe.utils.getdate(f"{month_start.year}-{month_start.month + 1:02d}-01")
			if len(periods) > 60:
				break

	return periods
