# Copyright (c) 2026, Dinext
"""Deprecated entrypoints for legacy Client/Server Scripts.

Whitelist moved to ``project_workload_assignment.api`` (refactor 8b4eb17).
Keep this module so demodev scripts that still call
``project_workload_assignment.project_workload_api.*`` resolve.

Prefer ``project_workload_assignment.api.*`` in new code.
"""

from __future__ import annotations

# Re-export same whitelisted callables (same function objects → already whitelisted).
from project_workload_assignment.api import (  # noqa: F401
	calculate_timesheet_limits,
	calculate_user_timesheet_limits,
	check_workload_overload,
	get_work_efforts_consolidated_data,
	get_work_efforts_grid,
	get_work_efforts_grid_v2,
	pwr_run_add_forecast_from_work_efforts,
	pwr_run_check_workload_overload,
	pwr_run_project_workload_charts,
	pwr_run_project_workload_tree,
	pwr_run_project_workload_tree_canonical,
	pwr_run_tasks_forecast_workload,
	pwr_run_team_workload_charts,
	pwr_run_team_workload_grid,
	pwr_run_team_workload_grid_canonical,
	save_forecast_as_plan,
	save_work_efforts_forecast_changes,
	update_forecast_from_assignments,
	we_save_forecast_changes,
	we_v2_save_forecast_changes,
)
