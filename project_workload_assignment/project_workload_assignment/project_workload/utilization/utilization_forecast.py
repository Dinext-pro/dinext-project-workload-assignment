# Copyright (c) 2026, Dinext
"""Прогнозные часы утилизации команды по назначениям PWA (ISS-2026-00002)."""

from __future__ import annotations

from project_workload_assignment.project_workload_assignment.project_workload.core.periods import (
	PWRPeriod,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.types import (
	ProjectUtilizationRow,
	UserWorkloadInfo,
)
from project_workload_assignment.project_workload_assignment.project_workload.utilization.utilization_helpers import (
	is_utilization_eligible_worker,
	project_util_included_on_date,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.workload_engine import (
	WorkloadContext,
)


def compute_team_utilization_forecast_series(
	wl_ctx: WorkloadContext,
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
	"""Сумма PWA forecast hours только для eligible Employee и проектов с pu_included=Да."""
	from project_workload_assignment.project_workload_assignment.project_workload.team_report.chart_aggregates import (
		_add_daily_hours_to_periods,
	)

	series = [0.0] * len(periods)
	for assignment in assignments:
		user_email = assignment.get("user")
		if not user_email:
			continue
		project_id = assignment.get("project_name") or assignment.get("project")
		if not project_id:
			continue

		daily_hours = wl_ctx.compute_assignment_daily_hours(assignment)
		filtered_hours: dict[str, float] = {}
		for date_str, hours in daily_hours.items():
			if not is_utilization_eligible_worker(
				user_email,
				date_str,
				users_data,
				worker_utilization_map,
				wtypes_map,
			):
				continue
			if not project_util_included_on_date(
				project_id, date_str, project_utilization_map
			):
				continue
			filtered_hours[date_str] = hours

		_add_daily_hours_to_periods(
			filtered_hours, date_to_period_key, period_index, series
		)

	return series
