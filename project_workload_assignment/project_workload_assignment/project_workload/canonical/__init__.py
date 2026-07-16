# Copyright (c) 2026, Dinext
"""Canonical GridResponse wrappers over legacy PWR calc (no formula changes)."""

from project_workload_assignment.project_workload_assignment.project_workload.canonical.reshape import (
	run_project_workload_tree_canonical,
	run_team_workload_grid_canonical,
)

__all__ = [
	"run_team_workload_grid_canonical",
	"run_project_workload_tree_canonical",
]
