# Copyright (c) 2026, Dinext
"""Smoke test PWR actual + period anchor."""

from __future__ import annotations

import frappe
from frappe.utils import add_months, nowdate

from project_workload_assignment.project_workload_assignment.project_workload.team_workload_grid import (
	run_get_projects_workload_data_v2,
)


def run():
	today = nowdate()
	anchor = today
	shifted = add_months(today, -3)

	def _call(anchor_date, load_actual):
		return run_get_projects_workload_data_v2(
			{
				"view_type": "weekly",
				"period_range": "quarter",
				"period_anchor_date": anchor_date,
				"load_actual": load_actual,
				"mode": "user_totals",
				"limit": 5,
				"offset": 0,
			}
		)

	base = _call(anchor, 0)
	with_fact = _call(anchor, 1)
	shifted_resp = _call(shifted, 1)

	def first_period_key(resp):
		periods = resp.get("periods") or []
		return periods[0]["key"] if periods else None

	def first_actual(resp):
		for row in resp.get("tree_data") or []:
			if not row.get("_isUser"):
				continue
			for key, val in row.items():
				if key.endswith("_actual") and float(val or 0) > 0:
					return key, val
		return None, None

	base_key = first_period_key(base)
	shift_key = first_period_key(shifted_resp)
	act_key, act_val = first_actual(with_fact)

	return {
		"base_first_period": base_key,
		"shifted_first_period": shift_key,
		"periods_shifted": base_key != shift_key,
		"sample_actual_field": act_key,
		"sample_actual_value": act_val,
		"users_with_fact": sum(
			1
			for row in with_fact.get("tree_data") or []
			if row.get("_isUser")
			and any(
				float(row.get(k) or 0) > 0 for k in row if isinstance(k, str) and k.endswith("_actual")
			)
		),
	}
