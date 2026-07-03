# Copyright (c) 2026, Dinext
"""Отключить PWR Client Script и Server Script после миграции UI/API в app.

ISS-2026-00002 Phase 4: CS V4 / Project_Workload и 4 PWR API SS больше не нужны на сайте.
Откат: включить legacy SS (Pre-Phase2) и CS из sandbox_cs через import_pwr_client_scripts.
"""

from __future__ import annotations

import frappe

# UI перенесён в public/js/pwr-report/* и pwr-project/*
MIGRATED_CLIENT_SCRIPTS = (
	"Projects Workload Report_V4",
	"Project_Workload",
)

# Тонкие обёртки заменены whitelist-методами project_workload_api.pwr_run_*
MIGRATED_SERVER_SCRIPTS = (
	"Get Projects Workload Data_Exp_V2",
	"Get_Project_Workload_Data_V3",
	"Get Tasks Exp And WorkloadV3",
	"Сheck Workload Overload_V2",
)


def _disable_client_scripts() -> list[str]:
	disabled = []
	for name in MIGRATED_CLIENT_SCRIPTS:
		if not frappe.db.exists("Client Script", name):
			continue
		if frappe.db.get_value("Client Script", name, "enabled"):
			frappe.db.set_value("Client Script", name, "enabled", 0, update_modified=True)
			disabled.append(name)
	return disabled


def _disable_server_scripts() -> list[str]:
	disabled = []
	for name in MIGRATED_SERVER_SCRIPTS:
		if not frappe.db.exists("Server Script", name):
			continue
		if not frappe.db.get_value("Server Script", name, "disabled"):
			frappe.db.set_value("Server Script", name, "disabled", 1, update_modified=True)
			disabled.append(name)
	return disabled


def run():
	disabled_cs = _disable_client_scripts()
	disabled_ss = _disable_server_scripts()
	frappe.db.commit()
	return {
		"disabled_client_scripts": disabled_cs,
		"disabled_server_scripts": disabled_ss,
		"missing_client_scripts": [
			n for n in MIGRATED_CLIENT_SCRIPTS if not frappe.db.exists("Client Script", n)
		],
		"missing_server_scripts": [
			n for n in MIGRATED_SERVER_SCRIPTS if not frappe.db.exists("Server Script", n)
		],
	}
