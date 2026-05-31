# Copyright (c) 2026, Dinext
"""Видимое окно дат и нижняя граница для SQL по назначениям (Project Workload)."""

from typing import TYPE_CHECKING
from datetime import date

import frappe

if TYPE_CHECKING:
	from project_workload_assignment.project_workload_assignment.project_workload.periods import PWRPeriod


def get_visible_window(periods: list["PWRPeriod"] | None, view_type: str) -> tuple[date, date]:
	"""Возвращает видимое окно дат для заданных периодов."""
	if not periods:
		today_obj = frappe.utils.getdate(frappe.utils.nowdate())
		return today_obj, today_obj
	if view_type == 'daily':
		return frappe.utils.getdate(periods[0]['date']), frappe.utils.getdate(periods[-1]['date'])
	return frappe.utils.getdate(periods[0]['start_date']), frappe.utils.getdate(periods[-1]['end_date'])


def compute_assignment_sql_lower_bound(display_start: str | date, today_date: str | date | None = None) -> date:
	"""Вычисляет нижнюю границу для SQL-запроса назначений."""
	if today_date is None:
		today_date = frappe.utils.nowdate()
	lower = frappe.utils.getdate(today_date)
	start = frappe.utils.getdate(display_start)
	if start > lower:
		lower = start
	return lower
