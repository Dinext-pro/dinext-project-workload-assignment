# Copyright (c) 2026, Dinext
"""Input parsing helpers for timesheet limits."""

from __future__ import annotations

import json


class LimitsParsing:
	@staticmethod
	def parse_limit_rows(rows: list[dict]) -> dict[str, float | None]:
		def parse(typ: str) -> float | None:
			for row in rows:
				row_type = (row.get("type") or "").strip().lower()
				if row_type == typ:
					limit = row.get("limit")
					if isinstance(limit, (int, float)):
						return float(limit)
					if limit and str(limit).replace(".", "", 1).isdigit():
						return float(limit)
			return None

		return {
			"block": parse("блокировка"),
			"warning": parse("предупреждение") or 100,
			"message": parse("уведомление"),
		}

	@staticmethod
	def as_json_list(value):
		"""frappe.call may pass list or JSON string."""
		if value is None or value == "":
			return []
		if isinstance(value, str):
			return json.loads(value)
		if isinstance(value, list):
			return value
		return list(value)

	@staticmethod
	def as_int(value) -> int | None:
		if value is None or value == "":
			return None
		try:
			return int(value)
		except (TypeError, ValueError):
			return None
