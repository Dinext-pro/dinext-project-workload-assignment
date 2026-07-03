# Copyright (c) 2026, Dinext
"""Capture golden fixtures for WE SS migration baseline (bench execute)."""

from __future__ import annotations

import json
from pathlib import Path

import frappe

from dinext_projects.dinext_projects.tests.scenarios.we_ss_migration_baseline.data_setup import (
	DEPENDENCY_PROJECT,
	DEPENDENCY_VIEW_OPTIONS,
)
from dinext_projects.dinext_projects.tests.scenarios.we_ss_migration_baseline.test_we_ss_baseline import (
	normalize_consolidated_golden,
	normalize_limits_golden,
)
from dinext_projects.dinext_projects.tests.scenarios.we_ss_migration_baseline.test_we_ss_baseline import (
	call_server_script_api,
)


def _fixtures_dir() -> Path:
	return Path(__file__).resolve().parent / "fixtures"


def _write_fixture(name: str, payload: dict) -> Path:
	path = _fixtures_dir() / name
	path.parent.mkdir(parents=True, exist_ok=True)
	with open(path, "w", encoding="utf-8") as f:
		json.dump(payload, f, ensure_ascii=False, indent=2, sort_keys=True)
		f.write("\n")
	return path


def capture_tc01() -> Path:
	raw = call_server_script_api(
		"get_work_efforts_consolidated_data",
		project=DEPENDENCY_PROJECT,
		view_options=DEPENDENCY_VIEW_OPTIONS,
	)
	golden = normalize_consolidated_golden(raw, project=DEPENDENCY_PROJECT, view_options=DEPENDENCY_VIEW_OPTIONS)
	golden["_comment"] = (
		"TC-01 baseline for get_work_efforts_consolidated_data on dependency project "
		f"{DEPENDENCY_PROJECT}. Regenerate: capture_golden.py"
	)
	return _write_fixture("tc01_consolidated_golden.json", golden)


def capture_tc02() -> Path:
	utp_rows = frappe.get_all(
		"User Timesheet Position",
		filters={
			"project": DEPENDENCY_PROJECT,
			"document_type": "Task",
			"period": ["is", "set"],
		},
		fields=[
			"name",
			"document_name",
			"project_role",
			"project",
			"status",
			"all_hours",
			"period",
			"custom_username",
		],
		order_by="modified desc",
		limit=1,
	)
	if not utp_rows:
		raise RuntimeError(f"No UTP with period on {DEPENDENCY_PROJECT}")

	row = utp_rows[0]
	period = str(row["period"])
	year_s, month_s = period.split("-", 1)
	position = {
		"name": row["name"],
		"document_name": row["document_name"],
		"project_role": row["project_role"],
		"project": row["project"],
		"status": row["status"],
		"all_hours": row["all_hours"],
		"year": int(year_s),
		"month": int(month_s),
		"custom_username": row.get("custom_username"),
	}
	raw = call_server_script_api(
		"calculate_timesheet_limits",
		positions=json.dumps([position]),
		timesheet_name="",
	)
	golden = {
		"_comment": (
			"TC-02 baseline for calculate_timesheet_limits. positions_payload is input; "
			"results is normalized API output. Regenerate: capture_golden.py"
		),
		"positions_payload": [position],
		"timesheet_name": "",
		"results": normalize_limits_golden(raw),
	}
	return _write_fixture("tc02_limits_golden.json", golden)


def run():
	frappe.set_user("Administrator")
	paths = [capture_tc01(), capture_tc02()]
	print(json.dumps({"fixtures": [str(p) for p in paths]}, ensure_ascii=False))


if __name__ == "__main__":
	run()
