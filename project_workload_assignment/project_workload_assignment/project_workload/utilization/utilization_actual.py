# Copyright (c) 2026, Dinext
"""Фактические часы утилизации из UTP (ISS-2026-02657)."""

from __future__ import annotations

from frappe.utils import flt

from project_workload_assignment.project_workload_assignment.project_workload.core.periods import (
	PWRPeriod,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.types import (
	ProjectUtilizationRow,
	UserWorkloadInfo,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.windows import (
	get_visible_window,
)
from project_workload_assignment.project_workload_assignment.project_workload.utilization.utilization_helpers import (
	is_utilization_eligible_worker,
	project_util_included_on_date,
)
from project_workload_assignment.project_workload_assignment.project_workload.utilization.utp_actual import (
	query_utp_daily_rows,
)


def compute_team_utilization_actual_series(
	assignments: list[dict],
	users_data: dict[str, UserWorkloadInfo],
	wtypes_map: dict[str, str],
	worker_utilization_map: dict[str, list[dict[str, str | float]]],
	project_utilization_map: dict[str, list[ProjectUtilizationRow]],
	periods: list[PWRPeriod],
	view_type: str,
	date_to_period_key: dict[str, str],
	period_index: dict[str, int],
) -> list[float]:
	"""Сумма согласованных UTP hours с теми же eligibility-фильтрами, что у utilization forecast."""
	from project_workload_assignment.project_workload_assignment.project_workload.team_report.chart_aggregates import (
		_add_daily_hours_to_periods,
	)

	period_count = len(periods)
	if not assignments or not period_count:
		return [0.0] * period_count

	assignment_pairs = {
		(a.get("user"), a.get("project_name") or a.get("project"))
		for a in assignments
		if a.get("user") and (a.get("project_name") or a.get("project"))
	}
	if not assignment_pairs:
		return [0.0] * period_count

	projects = sorted({pair[1] for pair in assignment_pairs})
	users = sorted({pair[0] for pair in assignment_pairs})
	display_start, display_end = get_visible_window(periods, view_type)

	series = [0.0] * period_count
	filtered_daily: dict[str, float] = {}

	for row in query_utp_daily_rows(
		str(display_start),
		str(display_end),
		projects=projects,
		users=users,
	):
		pair = (row["user"], row["project"])
		if pair not in assignment_pairs:
			continue
		date_str = row["date"]
		if not is_utilization_eligible_worker(
			row["user"],
			date_str,
			users_data,
			worker_utilization_map,
			wtypes_map,
		):
			continue
		if not project_util_included_on_date(
			row["project"], date_str, project_utilization_map
		):
			continue
		filtered_daily[date_str] = filtered_daily.get(date_str, 0.0) + flt(row["hours"])

	_add_daily_hours_to_periods(filtered_daily, date_to_period_key, period_index, series)
	return series
