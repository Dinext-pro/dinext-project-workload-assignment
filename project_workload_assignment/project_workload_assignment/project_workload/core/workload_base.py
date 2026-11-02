# Copyright (c) 2026, Dinext
"""База часов для % от трудоёмкости: план vs прогноз (ISS-2026-03483)."""

from __future__ import annotations

import frappe

WORKLOAD_BASE_PLAN = "От плана"
WORKLOAD_BASE_FORECAST = "От прогноза"
WORKLOAD_BASE_BY_PROJECT = "По проекту"
WORKLOAD_BASE_FIELD = "custom_workload_base"
LIMITS_BASE_FIELD = "custom_limits_base"
# Значения поля Project / вкладки Project:
WORKLOAD_BASE_OPTIONS = (WORKLOAD_BASE_PLAN, WORKLOAD_BASE_FORECAST)
# Селектор сводного отчёта (+ «По проекту»):
REPORT_WORKLOAD_BASE_OPTIONS = (
	WORKLOAD_BASE_PLAN,
	WORKLOAD_BASE_FORECAST,
	WORKLOAD_BASE_BY_PROJECT,
)

# site client_config keys (common_site_config / site_config)
WORKLOAD_DEFAULT_BASE_KEY = "workload_default_base"
LIMITS_DEFAULT_BASE_KEY = "limits_default_base"
# PlanFact / PWEA amount dict keys
HOURS_KEY_PLAN = "plan"
HOURS_KEY_EXPECTED = "expected"
_ALIASES = {
	"plan": WORKLOAD_BASE_PLAN,
	"from plan": WORKLOAD_BASE_PLAN,
	"от плана": WORKLOAD_BASE_PLAN,
	"forecast": WORKLOAD_BASE_FORECAST,
	"from forecast": WORKLOAD_BASE_FORECAST,
	"от прогноза": WORKLOAD_BASE_FORECAST,
}


def _client_config() -> dict:
	blob = frappe.conf.get("client_config")
	return blob if isinstance(blob, dict) else {}


def site_default_workload_base() -> str:
	"""Default when Project.custom_workload_base пуст.

	Читает ``client_config.workload_default_base``. Нет / пусто / мусор → «От плана».
	"""
	raw = str(_client_config().get(WORKLOAD_DEFAULT_BASE_KEY) or "").strip()
	if not raw:
		return WORKLOAD_BASE_PLAN
	if raw in WORKLOAD_BASE_OPTIONS:
		return raw
	return _ALIASES.get(raw.lower(), WORKLOAD_BASE_PLAN)


def normalize_workload_base(value) -> str:
	"""Канон поля Project: «От плана» | «От прогноза». Пусто → site default."""
	raw = str(value or "").strip()
	if raw in WORKLOAD_BASE_OPTIONS:
		return raw
	if not raw:
		return site_default_workload_base()
	return site_default_workload_base()


def normalize_report_workload_base(value) -> str:
	"""Канон селектора отчёта: план | прогноз | По проекту."""
	raw = str(value or "").strip()
	if raw in REPORT_WORKLOAD_BASE_OPTIONS:
		return raw
	return WORKLOAD_BASE_BY_PROJECT


def project_workload_base(project: str | None) -> str:
	if not project:
		return site_default_workload_base()
	val = frappe.db.get_value("Project", project, WORKLOAD_BASE_FIELD)
	return normalize_workload_base(val)


def load_project_workload_bases(projects: list[str] | set[str]) -> dict[str, str]:
	"""Project.name → От плана|От прогноза."""
	names = [p for p in projects if p]
	if not names:
		return {}
	rows = frappe.qb.get_query(
		"Project",
		fields=["name", WORKLOAD_BASE_FIELD],
		filters=[["name", "in", names]],
	).run(as_dict=True)
	fallback = site_default_workload_base()
	out = {name: fallback for name in names}
	for row in rows:
		out[row["name"]] = normalize_workload_base(row.get(WORKLOAD_BASE_FIELD))
	return out


def hours_source_from_form(fd, project: str | None = None) -> str:
	"""Режим для load_monthly_plan_cache: план | прогноз | По проекту.

	Явный workload_base из UI; иначе при одном project — его поле;
	иначе «По проекту» (сводный без override).
	"""
	if fd is not None:
		raw = str(fd.get("workload_base") or "").strip()
		if raw in REPORT_WORKLOAD_BASE_OPTIONS:
			return raw
	if project:
		return project_workload_base(project)
	return WORKLOAD_BASE_BY_PROJECT


def site_default_limits_base() -> str:
	"""Default when Project.custom_limits_base пуст.

	``client_config.limits_default_base``; нет → «От плана».
	"""
	raw = str(_client_config().get(LIMITS_DEFAULT_BASE_KEY) or "").strip()
	if not raw:
		return WORKLOAD_BASE_PLAN
	if raw in WORKLOAD_BASE_OPTIONS:
		return raw
	return _ALIASES.get(raw.lower(), WORKLOAD_BASE_PLAN)


def normalize_limits_base(value) -> str:
	"""Канон поля Project «Подсчёт лимитов». Пусто → site default."""
	raw = str(value or "").strip()
	if raw in WORKLOAD_BASE_OPTIONS:
		return raw
	return site_default_limits_base()


def project_limits_base(project: str | None) -> str:
	if not project:
		return site_default_limits_base()
	val = frappe.db.get_value("Project", project, LIMITS_BASE_FIELD)
	return normalize_limits_base(val)


def load_project_limits_bases(projects: list[str] | set[str]) -> dict[str, str]:
	"""Project.name → От плана|От прогноза (лимиты)."""
	names = [p for p in projects if p]
	if not names:
		return {}
	rows = frappe.qb.get_query(
		"Project",
		fields=["name", LIMITS_BASE_FIELD],
		filters=[["name", "in", names]],
	).run(as_dict=True)
	fallback = site_default_limits_base()
	out = {name: fallback for name in names}
	for row in rows:
		out[row["name"]] = normalize_limits_base(row.get(LIMITS_BASE_FIELD))
	return out


def hours_key_from_limits_base(value) -> str:
	"""PlanFact amount key: plan | expected."""
	if normalize_limits_base(value) == WORKLOAD_BASE_FORECAST:
		return HOURS_KEY_EXPECTED
	return HOURS_KEY_PLAN
