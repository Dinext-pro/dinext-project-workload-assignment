# Copyright (c) 2026, Dinext
"""Агрегаты для сводных графиков PWR и вкладки «Загрузка» проекта (ISS-2026-00002)."""

from __future__ import annotations

import frappe
from frappe.utils import flt, getdate

from project_workload_assignment.project_workload_assignment.project_workload.core.periods import (
	PWRPeriod,
	build_date_to_period_key,
	generate_periods_for_pwr_report,
	generate_periods_for_project_window,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.windows import (
	compute_assignment_sql_lower_bound,
	get_visible_window,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.workload_engine import (
	WorkloadContext,
)

from project_workload_assignment.project_workload_assignment.project_workload.core.worker_wtype_helpers import (
	WORKER_WTYPES,
	filter_users_by_wtype,
	normalize_worker_wtype_filter,
	resolve_wtype,
)

from project_workload_assignment.project_workload_assignment.project_workload.models import (
	ChartSeries,
	ChartMeta,
	ChartResponse,
	TeamChartFormDict,
	ProjectChartFormDict,
)


# Backward-compatible aliases for tests and external imports.
_normalize_worker_wtype_filter = normalize_worker_wtype_filter
_filter_users_by_wtype = filter_users_by_wtype
_resolve_wtype = resolve_wtype


def _parse_bool(value, default: bool = False) -> bool:
	if value is None:
		return default
	if isinstance(value, bool):
		return value
	if isinstance(value, (int, float)):
		return bool(value)
	if isinstance(value, str):
		return value.strip().lower() in {"1", "true", "yes", "on"}
	return default


def _zero_series(period_count: int) -> list[float]:
	return [0.0] * period_count


def _zero_wtype_series(period_count: int) -> dict[str, list[float]]:
	return {wtype: _zero_series(period_count) for wtype in WORKER_WTYPES}


def _period_date_strings(periods: list[PWRPeriod], view_type: str) -> set[str]:
	dates: set[str] = set()
	for period in periods:
		if view_type == "daily":
			dates.add(period["date"])
		else:
			current_date = getdate(period["start_date"])
			end_date = getdate(period["end_date"])
			while current_date <= end_date:
				dates.add(str(current_date))
				current_date = frappe.utils.add_days(current_date, 1)
	return dates


def _add_daily_hours_to_periods(
	daily_hours: dict[str, float],
	date_to_period_key: dict[str, str],
	period_index: dict[str, int],
	target: list[float],
) -> None:
	for date_str, hours in daily_hours.items():
		period_key = date_to_period_key.get(date_str)
		if period_key is None:
			continue
		idx = period_index.get(period_key)
		if idx is None:
			continue
		target[idx] += flt(hours)


def _fetch_team_assignments(fd: TeamChartFormDict) -> list[dict]:
	from project_workload_assignment.project_workload_assignment.project_workload.core.assignments import (
		fetch_pwr_report_assignments,
	)

	view_type = fd.get("view_type", "daily")
	period_range = fd.get("period_range", "quarter")
	user = fd.get("user")
	project = fd.get("project")
	project_portfolio = fd.get("project_portfolio")
	user_group = fd.get("user_group")
	period_anchor_date = fd.get("period_anchor_date")

	periods = generate_periods_for_pwr_report(view_type, period_range, period_anchor_date)
	display_start, display_end = get_visible_window(periods, view_type)
	assignment_lower = compute_assignment_sql_lower_bound(display_start)
	window_start = getdate(assignment_lower)
	window_end = getdate(display_end)

	use_sql_ug = bool(user_group)
	assignments = fetch_pwr_report_assignments(
		window_start,
		window_end,
		user=user,
		project=project,
		project_portfolio=project_portfolio,
		user_group_parent=user_group,
		use_sql_user_group_join=use_sql_ug,
		restrict_users=None,
	) or []

	if user_group and not use_sql_ug:
		group_users = {
			row["user"]
			for row in frappe.qb.get_query(
				"User Group Member",
				fields=["user"],
				filters=[["parent", "=", user_group], ["user", "is", "set"]],
			).run(as_dict=True)
		}
		assignments = [a for a in assignments if a.get("user") in group_users]

	from project_workload_assignment.project_workload_assignment.project_workload.core.context_loaders import (
		filter_assignments_by_permitted_workers,
	)

	return filter_assignments_by_permitted_workers(assignments)


def _build_workload_context(assignments: list[dict], users_list: list[str]):
	from project_workload_assignment.project_workload_assignment.project_workload.core.context_loaders import (
		load_holiday_data,
		load_monthly_plan_cache,
		load_projects,
		load_user_absences,
		load_users_with_worker_context,
		load_working_hours_overrides,
	)

	projects_set = {a["project_name"] for a in assignments if a.get("project_name")}
	users_data = load_users_with_worker_context(users_list)
	projects_data = load_projects(list(projects_set))
	working_hours_overrides = load_working_hours_overrides(users_data)
	holiday_lists_cache, holiday_date_sets = load_holiday_data(users_data, projects_data)
	user_absences = load_user_absences(users_list)
	monthly_plan_cache = load_monthly_plan_cache(assignments)

	wl_ctx = WorkloadContext(
		users_data=users_data,
		projects_data=projects_data,
		working_hours_overrides=working_hours_overrides,
		holiday_date_sets=holiday_date_sets,
		user_absences=user_absences,
		monthly_plan_cache=monthly_plan_cache,
		holiday_lists_cache=holiday_lists_cache,
	)
	return wl_ctx, users_data


def _compute_capacity_series(
	wl_ctx: WorkloadContext,
	users_list: list[str],
	periods: list[PWRPeriod],
	view_type: str,
	date_to_period_key: dict[str, str],
	period_index: dict[str, int],
) -> list[float]:
	capacity = _zero_series(len(periods))
	period_dates = _period_date_strings(periods, view_type)
	wl_ctx.preload_user_base_hours(users_list, period_dates)

	for user_email in users_list:
		for date_str in period_dates:
			available = wl_ctx.get_available_hours(date_str, user_email, "")
			if available <= 0:
				continue
			period_key = date_to_period_key.get(date_str)
			if period_key is None:
				continue
			idx = period_index.get(period_key)
			if idx is None:
				continue
			capacity[idx] += available
	return capacity


def _compute_workload_by_wtype(
	assignments: list[dict],
	wl_ctx: WorkloadContext,
	users_data: dict,
	wtypes_map: dict[str, str],
	periods: list[PWRPeriod],
	view_type: str,
	date_to_period_key: dict[str, str],
	period_index: dict[str, int],
) -> dict[str, list[float]]:
	series = _zero_wtype_series(len(periods))
	for assignment in assignments:
		user_email = assignment.get("user")
		if not user_email:
			continue
		wtype = resolve_wtype(user_email, users_data, wtypes_map)
		daily_loads = wl_ctx.compute_assignment_daily_hours(assignment)
		_add_daily_hours_to_periods(daily_loads, date_to_period_key, period_index, series[wtype])
	return series


def _resolve_plan_year_month(
	year_value,
	month_value,
	fy_cache: dict | None = None,
) -> tuple[int, int] | None:
	"""pwea_year is Link→Fiscal Year (or legacy numeric year string)."""
	from frappe.utils import cint

	month = cint(month_value)
	if month < 1 or month > 12:
		return None

	raw = year_value
	if raw is None:
		return None
	if isinstance(raw, (int, float)):
		return int(raw), month

	s = str(raw).strip()
	if not s:
		return None
	try:
		return int(s), month
	except (TypeError, ValueError):
		pass

	cache = fy_cache if fy_cache is not None else {}
	if s not in cache:
		cache[s] = frappe.db.get_value(
			"Fiscal Year",
			s,
			["year_start_date", "year_end_date"],
			as_dict=True,
		)
	fy = cache[s]
	if not fy or not fy.get("year_start_date"):
		return None

	start = getdate(fy["year_start_date"])
	end = getdate(fy.get("year_end_date") or fy["year_start_date"])
	for y in sorted({start.year, end.year}):
		try:
			d = getdate(f"{y}-{month:02d}-01")
		except Exception:
			continue
		if start <= d <= end:
			return y, month
	return start.year, month


def _load_project_plan_series(
	project: str,
	periods: list[PWRPeriod],
	view_type: str,
	date_to_period_key: dict[str, str],
	period_index: dict[str, int],
	wl_ctx: WorkloadContext,
	project_name: str,
) -> list[float]:
	"""Суммарный план PWE по проекту, размазанный по рабочим дням месяца."""
	series = _zero_series(len(periods))
	PWE = frappe.qb.DocType("Project Work Efforts")
	PWEA = frappe.qb.DocType("Project Work Efforts Amount")
	plans = (
		frappe.qb.from_(PWE)
		.inner_join(PWEA)
		.on(PWEA.parent == PWE.name)
		.select(
			PWEA.pwea_year.as_("year"),
			PWEA.pwea_month.as_("month"),
			PWEA.pwea_plan.as_("plan_hours"),
		)
		.where(PWE.pwe_project == project)
		.where(PWEA.pwea_plan > 0)
	).run(as_dict=True)

	fy_cache: dict = {}
	for plan in plans:
		resolved = _resolve_plan_year_month(plan["year"], plan["month"], fy_cache)
		if not resolved:
			continue
		year, month = resolved
		plan_hours = flt(plan["plan_hours"])
		if plan_hours <= 0:
			continue
		month_start = getdate(f"{year}-{month:02d}-01")
		month_end = frappe.utils.get_last_day(month_start)
		working_days: list[str] = []
		current_date = month_start
		while current_date <= month_end:
			date_str = str(current_date)
			if wl_ctx.is_working_day(date_str, "", project_name):
				working_days.append(date_str)
			current_date = frappe.utils.add_days(current_date, 1)
		if not working_days:
			continue
		daily_plan = plan_hours / len(working_days)
		for date_str in working_days:
			period_key = date_to_period_key.get(date_str)
			if period_key is None:
				continue
			idx = period_index.get(period_key)
			if idx is None:
				continue
			series[idx] += daily_plan
	return series




def run_get_team_workload_charts(fd: TeamChartFormDict | None) -> ChartResponse:
	"""Сводный график Projects Workload Report (без user paging)."""
	if fd is None:
		fd = {}
	try:
		view_type = fd.get("view_type", "daily")
		period_range = fd.get("period_range", "quarter")
		period_anchor_date = fd.get("period_anchor_date")
		worker_wtype_filter = normalize_worker_wtype_filter(fd.get("worker_wtype"))
		load_utilization = _parse_bool(fd.get("load_utilization"))
		load_actual = _parse_bool(fd.get("load_actual"))

		periods = generate_periods_for_pwr_report(view_type, period_range, period_anchor_date)
		period_index = {p["key"]: i for i, p in enumerate(periods)}
		date_to_period_key = build_date_to_period_key(periods, view_type)

		assignments = _fetch_team_assignments(fd)
		if not assignments:
			return ChartResponse(
				periods=periods,
				series=ChartSeries(
					capacity_hours=_zero_series(len(periods)),
					utilization_plan_hours=_zero_series(len(periods)),
					utilization_forecast_hours=_zero_series(len(periods)),
					workload_forecast_hours_by_wtype=_zero_wtype_series(len(periods)),
				),
				meta=ChartMeta(
					worker_wtype_filter=worker_wtype_filter or "all",
					utilization_loaded=load_utilization,
					actual_loaded=load_actual,
					users_in_scope=0,
				),
				message="No assignments found",
			)

		users_list = sorted({a["user"] for a in assignments if a.get("user")})
		wl_ctx, users_data = _build_workload_context(assignments, users_list)
		from project_workload_assignment.project_workload_assignment.project_workload.core.context_loaders import (
			load_worker_wtypes,
		)

		wtypes_map = load_worker_wtypes(users_list)
		users_in_scope = filter_users_by_wtype(
			users_list, worker_wtype_filter, users_data, wtypes_map
		)
		users_in_scope_set = set(users_in_scope)
		assignments = [a for a in assignments if a.get("user") in users_in_scope_set]

		capacity = _compute_capacity_series(
			wl_ctx, users_in_scope, periods, view_type, date_to_period_key, period_index
		)
		workload_by_wtype = _compute_workload_by_wtype(
			assignments,
			wl_ctx,
			users_data,
			wtypes_map,
			periods,
			view_type,
			date_to_period_key,
			period_index,
		)

		util_plan = _zero_series(len(periods))
		util_forecast = _zero_series(len(periods))
		if load_utilization:
			from project_workload_assignment.project_workload_assignment.project_workload.core.context_loaders import (
				load_project_utilization_tables,
				load_worker_utilization_tables,
			)
			from project_workload_assignment.project_workload_assignment.project_workload.utilization.utilization_forecast import (
				compute_team_utilization_forecast_series,
			)
			from project_workload_assignment.project_workload_assignment.project_workload.utilization.utilization_plan import (
				compute_team_utilization_plan_series,
			)

			projects_set = {
				a.get("project_name") or a.get("project")
				for a in assignments
				if a.get("project_name") or a.get("project")
			}
			worker_utilization_map = load_worker_utilization_tables(users_in_scope)
			project_utilization_map = load_project_utilization_tables(list(projects_set))
			util_plan = compute_team_utilization_plan_series(
				wl_ctx,
				users_in_scope,
				periods,
				view_type,
				worker_utilization_map,
				users_data,
				wtypes_map,
			)
			util_forecast = compute_team_utilization_forecast_series(
				wl_ctx,
				assignments,
				users_data,
				wtypes_map,
				worker_utilization_map,
				project_utilization_map,
				periods,
				view_type,
				date_to_period_key,
				period_index,
			)

		actual_by_wtype = _zero_wtype_series(len(periods))
		if load_actual:
			from project_workload_assignment.project_workload_assignment.project_workload.utilization.utp_actual import (
				load_team_utp_hours_by_wtype,
			)

			actual_by_wtype = load_team_utp_hours_by_wtype(
				assignments,
				periods,
				view_type,
				wtypes_map,
				users_data,
				worker_wtype_filter,
			)

		series = ChartSeries(
			capacity_hours=capacity,
			utilization_plan_hours=util_plan,
			utilization_forecast_hours=util_forecast,
			workload_forecast_hours_by_wtype=workload_by_wtype,
		)
		if load_actual:
			series["actual_hours_by_wtype"] = actual_by_wtype

		return ChartResponse(
			periods=periods,
			series=series,
			meta=ChartMeta(
				worker_wtype_filter=worker_wtype_filter or "all",
				utilization_loaded=load_utilization,
				actual_loaded=load_actual,
				users_in_scope=len(users_in_scope),
			),
		)
	except Exception as e:
		frappe.log_error(title="PWR team workload charts failed", message=frappe.get_traceback())
		return ChartResponse(
			periods=[],
			series=ChartSeries(),
			meta=ChartMeta(),
			error=str(e),
			message="Chart aggregation failed",
		)


def run_get_project_workload_charts(fd: ProjectChartFormDict | None) -> ChartResponse:
	"""Сводный график вкладки «Загрузка» проекта."""
	if fd is None:
		fd = {}
	try:
		project = fd.get("project")
		if not project:
			return ChartResponse(periods=[], series=ChartSeries(), meta=ChartMeta(), message="No project specified")

		view_type = fd.get("view_type", "daily")
		date_from = fd.get("date_from") or frappe.utils.nowdate()
		date_to = fd.get("date_to") or frappe.utils.add_months(date_from, 1)
		worker_wtype_filter = normalize_worker_wtype_filter(fd.get("worker_wtype"))
		load_actual = _parse_bool(fd.get("load_actual"))
		load_utilization = _parse_bool(fd.get("load_utilization"))

		project_row = frappe.db.get_value(
			"Project",
			project,
			["name", "project_name"],
			as_dict=True,
		)
		# Keep filter date_from/date_to as-is (same window as project tree table).
		# Clamping to expected_end_date only in charts caused N_chart < N_table
		# and bar/column pitch drift after period_range switches.

		periods = generate_periods_for_project_window(date_from, date_to, view_type)
		period_index = {p["key"]: i for i, p in enumerate(periods)}
		date_to_period_key = build_date_to_period_key(periods, view_type)

		from project_workload_assignment.project_workload_assignment.project_workload.core.assignments import (
			fetch_project_assignments_with_worker_context,
		)

		assignments_raw = fetch_project_assignments_with_worker_context(
			project, str(date_from), str(date_to)
		) or []
		assignments = [
			{
				"user": a["user"],
				"task": a["task_id"],
				"role": a.get("role"),
				"date_from": a["date_from"],
				"date_to": a["date_to"],
				"workload": a.get("workload"),
				"wl_value": a.get("wl_value"),
				"project": project,
				"project_name": project,
			}
			for a in assignments_raw
		]

		users_list = sorted({a["user"] for a in assignments if a.get("user")})
		wl_ctx, users_data = _build_workload_context(assignments, users_list)
		from project_workload_assignment.project_workload_assignment.project_workload.core.context_loaders import (
			load_worker_wtypes,
		)

		wtypes_map = load_worker_wtypes(users_list)
		users_in_scope = filter_users_by_wtype(
			users_list, worker_wtype_filter, users_data, wtypes_map
		)
		users_in_scope_set = set(users_in_scope)
		assignments = [a for a in assignments if a.get("user") in users_in_scope_set]

		project_display_name = (project_row or {}).get("project_name") or project
		team_capacity = _compute_capacity_series(
			wl_ctx, users_in_scope, periods, view_type, date_to_period_key, period_index
		)
		project_plan = _load_project_plan_series(
			project,
			periods,
			view_type,
			date_to_period_key,
			period_index,
			wl_ctx,
			project_display_name,
		)
		workload_by_wtype = _compute_workload_by_wtype(
			assignments,
			wl_ctx,
			users_data,
			wtypes_map,
			periods,
			view_type,
			date_to_period_key,
			period_index,
		)
		actual_by_wtype = _zero_wtype_series(len(periods))
		if load_actual:
			from project_workload_assignment.project_workload_assignment.project_workload.utilization.utp_actual import (
				load_utp_hours_by_wtype,
			)

			actual_by_wtype = load_utp_hours_by_wtype(
				project,
				str(date_from),
				str(date_to),
				wtypes_map,
				users_data,
				len(periods),
				date_to_period_key,
				period_index,
				worker_wtype_filter,
				users=users_in_scope,
			)

		util_plan = _zero_series(len(periods))
		util_forecast = _zero_series(len(periods))
		if load_utilization:
			from project_workload_assignment.project_workload_assignment.project_workload.core.context_loaders import (
				load_project_utilization_tables,
				load_worker_utilization_tables,
			)
			from project_workload_assignment.project_workload_assignment.project_workload.utilization.utilization_forecast import (
				compute_team_utilization_forecast_series,
			)
			from project_workload_assignment.project_workload_assignment.project_workload.utilization.utilization_plan import (
				compute_team_utilization_plan_series,
			)

			worker_utilization_map = load_worker_utilization_tables(users_in_scope)
			project_utilization_map = load_project_utilization_tables([project])
			util_plan = compute_team_utilization_plan_series(
				wl_ctx,
				users_in_scope,
				periods,
				view_type,
				worker_utilization_map,
				users_data,
				wtypes_map,
			)
			util_forecast = compute_team_utilization_forecast_series(
				wl_ctx,
				assignments,
				users_data,
				wtypes_map,
				worker_utilization_map,
				project_utilization_map,
				periods,
				view_type,
				date_to_period_key,
				period_index,
			)

		series = ChartSeries(
			project_plan_hours=project_plan,
			team_capacity_hours=team_capacity,
			workload_forecast_hours_by_wtype=workload_by_wtype,
		)
		if load_actual:
			series["actual_hours_by_wtype"] = actual_by_wtype
		if load_utilization:
			series["utilization_plan_hours"] = util_plan
			series["utilization_forecast_hours"] = util_forecast

		return ChartResponse(
			periods=periods,
			series=series,
			meta=ChartMeta(
				worker_wtype_filter=worker_wtype_filter or "all",
				utilization_loaded=load_utilization,
				actual_loaded=load_actual,
				users_in_scope=len(users_in_scope),
				project=project,
			),
		)
	except Exception as e:
		frappe.log_error(title="PWR project workload charts failed", message=frappe.get_traceback())
		return ChartResponse(
			periods=[],
			series=ChartSeries(),
			meta=ChartMeta(),
			error=str(e),
			message="Chart aggregation failed",
		)
