# Copyright (c) 2026, Dinext
"""Точечный импорт PWR client scripts на сайт.

Приоритет источника:
1. sandbox_cs/ рядом с этим модулем (копия .sandbox/local, не затирает ISS-2026-00002)
2. dinord_erpnext_customization fixtures (legacy fallback)
"""

from __future__ import annotations

import json
from pathlib import Path

import frappe

TARGET_NAMES = {
	"Projects Workload Report_V4",
	"Projects_Workload_Report_Style_V2",
	"Project_Workload",
}

# demodev/local parity: активные версии CS (см. ISS-2026-00002 / ISS-2026-00709).
ENABLE_ON_IMPORT = {
	"Projects Workload Report_V4",
	"Projects_Workload_Report_Style_V2",
	"Project_Workload",
	"Project_Workload_Style_V3",
}

DISABLE_ON_IMPORT = {
	"Projects Workload Report_V6",
	"Projects_Workload_Report_Style_V4",
	"Project_Workload_V4",
	"Project_Workload_Style_V4",
}

SANDBOX_CS_DIR = Path(__file__).resolve().parent / "sandbox_cs"
FIXTURE_PATH = Path(
	"/home/frappe/frappe-bench/apps/dinord_erpnext_customization/dinord_erpnext_customization/fixtures/client_script.json"
)


def _read_sandbox_script(name: str) -> str | None:
	path = SANDBOX_CS_DIR / f"{name}.js"
	if not path.is_file():
		return None
	return path.read_text(encoding="utf-8")


def _read_fixture_script(name: str) -> str | None:
	if not FIXTURE_PATH.is_file():
		return None
	rows = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
	by_name = {row["name"]: row for row in rows if row.get("doctype") == "Client Script"}
	row = by_name.get(name)
	if not row:
		return None
	return row.get("script")


def run():
	updated = []
	skipped = []
	for name in sorted(TARGET_NAMES):
		if not frappe.db.exists("Client Script", name):
			skipped.append({"name": name, "reason": "missing on site"})
			continue
		script = _read_sandbox_script(name)
		source = "sandbox_cs"
		if not script:
			script = _read_fixture_script(name)
			source = "fixture"
		if not script:
			skipped.append({"name": name, "reason": "no source"})
			continue
		frappe.db.set_value("Client Script", name, "script", script, update_modified=True)
		updated.append({"name": name, "source": source})

	enabled = []
	disabled = []
	for name in sorted(ENABLE_ON_IMPORT):
		if frappe.db.exists("Client Script", name):
			frappe.db.set_value("Client Script", name, "enabled", 1, update_modified=True)
			enabled.append(name)
	for name in sorted(DISABLE_ON_IMPORT):
		if frappe.db.exists("Client Script", name):
			frappe.db.set_value("Client Script", name, "enabled", 0, update_modified=True)
			disabled.append(name)

	frappe.db.commit()
	return {
		"updated": updated,
		"skipped": skipped,
		"enabled": enabled,
		"disabled": disabled,
		"count": len(updated),
	}
