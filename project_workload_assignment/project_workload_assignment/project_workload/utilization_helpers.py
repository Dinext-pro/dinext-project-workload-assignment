# Copyright (c) 2026, Dinext
"""Хелперы фильтрации утилизации PWR (Worker validity, util %, project pu_included)."""

from __future__ import annotations

from datetime import date

from frappe.utils import getdate

from project_workload_assignment.project_workload_assignment.project_workload.types import (
	ProjectUtilizationRow,
	UserWorkloadInfo,
)
from project_workload_assignment.project_workload_assignment.project_workload.worker_wtype_helpers import (
	resolve_wtype,
)

WorkerUtilizationMap = dict[str, list[dict[str, str | float]]]
ProjectUtilizationMap = dict[str, list[ProjectUtilizationRow]]


def is_worker_active_on_date(
	wvalid_from: date | str | None,
	wvalid_for: date | str | None,
	date_str: str,
) -> bool:
	"""Worker активен на дату: wvalid_from <= date; wvalid_for null = бессрочно."""
	if not wvalid_from:
		return False

	target_date = getdate(date_str)
	if getdate(wvalid_from) > target_date:
		return False
	if wvalid_for and getdate(wvalid_for) < target_date:
		return False
	return True


def worker_utilization_pct_on_date(
	user_email: str,
	date_str: str,
	worker_utilization_map: WorkerUtilizationMap,
) -> float | None:
	"""% утилизации Worker на дату; None если нет строк util_valid_from <= date."""
	util_rows = worker_utilization_map.get(user_email) or []
	target_date = getdate(date_str)
	valid_rows = [
		row
		for row in util_rows
		if row.get("util_valid_from") and getdate(row["util_valid_from"]) <= target_date
	]
	if not valid_rows:
		return None
	latest = max(valid_rows, key=lambda row: getdate(row["util_valid_from"]))
	return float(latest.get("utilization") or 0)


def project_util_included_on_date(
	project_id: str,
	date_str: str,
	project_utilization_map: ProjectUtilizationMap,
) -> bool:
	"""Проект включён в утилизацию на дату (pu_included == «Да»); False если таблица пуста."""
	util_rows = project_utilization_map.get(project_id) or []
	if not util_rows:
		return False

	target_date = getdate(date_str)
	valid_rows = [
		row
		for row in util_rows
		if row.get("pu_valid_from") and getdate(row["pu_valid_from"]) <= target_date
	]
	if not valid_rows:
		return False

	latest = max(valid_rows, key=lambda row: getdate(row["pu_valid_from"]))
	return latest.get("pu_included") == "Да"


def is_utilization_eligible_worker(
	user_email: str,
	date_str: str,
	users_data: dict[str, UserWorkloadInfo],
	worker_utilization_map: WorkerUtilizationMap,
	wtypes_map: dict[str, str],
) -> bool:
	"""Employee + активный wvalid + задан % утилизации на дату."""
	if resolve_wtype(user_email, users_data, wtypes_map) != "Employee":
		return False

	user_data = users_data.get(user_email) or {}

	if not is_worker_active_on_date(
		user_data.get("wvalid_from"),
		user_data.get("wvalid_for"),
		date_str,
	):
		return False

	return worker_utilization_pct_on_date(user_email, date_str, worker_utilization_map) is not None
