# Copyright (c) 2026, Dinext
"""Фильтрация Worker.wtype (Employee/Supplier) для PWR API."""

from __future__ import annotations

WORKER_WTYPES = ("Employee", "Supplier")


def normalize_worker_wtype_filter(value: str | None) -> str | None:
	if not value:
		return None
	normalized = str(value).strip()
	if not normalized or normalized.lower() in {"all", "все"}:
		return None
	if normalized in WORKER_WTYPES:
		return normalized
	return None


def resolve_wtype(user_email: str, users_data: dict, wtypes_map: dict[str, str]) -> str:
	wtype = (users_data.get(user_email) or {}).get("wtype") or wtypes_map.get(user_email) or ""
	if wtype in WORKER_WTYPES:
		return wtype
	return "Employee"


def filter_users_by_wtype(
	users: list[str],
	worker_wtype_filter: str | None,
	users_data: dict,
	wtypes_map: dict[str, str],
) -> list[str]:
	if not worker_wtype_filter:
		return users
	filtered: list[str] = []
	for user_email in users:
		if resolve_wtype(user_email, users_data, wtypes_map) == worker_wtype_filter:
			filtered.append(user_email)
	return filtered
