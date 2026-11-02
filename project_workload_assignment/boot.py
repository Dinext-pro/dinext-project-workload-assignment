# Copyright (c) 2026, Dinext and contributors
"""Desk bootinfo: default workload view/period/base from site client_config."""

from __future__ import annotations

import frappe

CLIENT_CONFIG_KEY = "client_config"
VIEW_TYPE_KEY = "workload_default_view_type"
PERIOD_RANGE_KEY = "workload_default_period_range"
ALLOWED_VIEW_TYPES = frozenset({"daily", "weekly", "monthly"})
ALLOWED_PERIOD_RANGES = frozenset({"quarter", "half_year", "year"})


def _client_config() -> dict:
	blob = frappe.conf.get(CLIENT_CONFIG_KEY)
	return blob if isinstance(blob, dict) else {}


def _resolve_choice(key: str, allowed: frozenset[str]) -> str | None:
	value = str(_client_config().get(key) or "").strip().lower()
	if value in allowed:
		return value
	return None


def resolve_default_view_type() -> str | None:
	"""Read ``client_config.workload_default_view_type``.

	Missing / empty / invalid → ``None``. Desk keeps weekly.
	Local site leaves the key unset.
	"""
	return _resolve_choice(VIEW_TYPE_KEY, ALLOWED_VIEW_TYPES)


def resolve_default_period_range() -> str | None:
	"""Read ``client_config.workload_default_period_range``.

	Missing / empty / invalid → ``None``. Desk keeps quarter.
	"""
	return _resolve_choice(PERIOD_RANGE_KEY, ALLOWED_PERIOD_RANGES)


def resolve_default_workload_base() -> str:
	"""Read ``client_config.workload_default_base``; fallback «От плана»."""
	from project_workload_assignment.project_workload_assignment.project_workload.core.workload_base import (
		site_default_workload_base,
	)

	return site_default_workload_base()


def resolve_default_limits_base() -> str:
	"""Read ``client_config.limits_default_base``; fallback «От плана»."""
	from project_workload_assignment.project_workload_assignment.project_workload.core.workload_base import (
		site_default_limits_base,
	)

	return site_default_limits_base()


def extend_bootinfo(bootinfo) -> None:
	bootinfo.workload_default_view_type = resolve_default_view_type()
	bootinfo.workload_default_period_range = resolve_default_period_range()
	bootinfo.workload_default_base = resolve_default_workload_base()
	bootinfo.limits_default_base = resolve_default_limits_base()
