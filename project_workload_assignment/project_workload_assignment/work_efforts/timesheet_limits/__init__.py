# Copyright (c) 2026, Dinext
"""Unified timesheet plan/limit calculator (ISS-2026-02105).

Public entrypoints for whitelist and tests. Implementation split by class:
bulk load, plan resolution, hours aggregation, orchestration.
"""

from __future__ import annotations

from project_workload_assignment.project_workload_assignment.work_efforts.models import (
	TimesheetLimitsFormInput,
	TimesheetLimitsResponse,
)
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.bulk_loader import (
	TimesheetLimitsBulkData,
)
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.calculator import (
	TimesheetLimitsCalculator,
)
from project_workload_assignment.project_workload_assignment.work_efforts.timesheet_limits.plan_resolver import (
	TaskPlanResolver,
)

__all__ = [
	"TimesheetLimitsBulkData",
	"TimesheetLimitsCalculator",
	"TaskPlanResolver",
	"run_calculate_timesheet_limits",
	"resolve_task_plan",
]


def run_calculate_timesheet_limits(
	form_dict: TimesheetLimitsFormInput,
) -> TimesheetLimitsResponse:
	return TimesheetLimitsCalculator.run(form_dict)


def resolve_task_plan(
	project: str,
	task: str,
	role: str,
	year: int | None,
	month: int | None,
	*,
	task_meta: dict,
	children_map: dict,
	pwe_by_task_role: dict,
	pwe_amounts: dict,
	requirement: str = "Опционально",
	root_task_with_issue: str | None = None,
	can_go_above_root_issue: bool = False,
	plan_cache: dict | None = None,
):
	"""Test/helper API: resolve plan over pre-built maps (no DB)."""
	bulk = TimesheetLimitsBulkData(
		task_meta=task_meta,
		children_map=children_map,
		pwe_by_task_role=pwe_by_task_role,
		pwe_amounts=pwe_amounts,
	)
	return TaskPlanResolver.resolve(
		project,
		task,
		role,
		year,
		month,
		bulk,
		requirement=requirement,
		root_task_with_issue=root_task_with_issue,
		can_go_above_root_issue=can_go_above_root_issue,
		plan_cache=plan_cache,
	)
