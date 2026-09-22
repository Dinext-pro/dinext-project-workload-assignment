# Copyright (c) 2026, Dinext and contributors
"""Desk bootinfo: default workload view/period from site client_config."""

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

	Missing / empty / invalid → ``None``. Desk keeps surface defaults
	(PWR weekly, project tab daily). Local site leaves the key unset.
	"""
	return _resolve_choice(VIEW_TYPE_KEY, ALLOWED_VIEW_TYPES)


def resolve_default_period_range() -> str | None:
	"""Read ``client_config.workload_default_period_range``.

	Missing / empty / invalid → ``None``. Desk keeps quarter.
	"""
	return _resolve_choice(PERIOD_RANGE_KEY, ALLOWED_PERIOD_RANGES)


def extend_bootinfo(bootinfo) -> None:
	bootinfo.workload_default_view_type = resolve_default_view_type()
	bootinfo.workload_default_period_range = resolve_default_period_range()
