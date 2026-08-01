# Copyright (c) 2026, Dinext
"""Проверка перегрузки PWA относительно прогноза PWE (API check_workload_overload)."""

from __future__ import annotations

import frappe

from project_workload_assignment.project_workload_assignment.project_workload.project_report.single_project_workload_tree import (
	run_get_project_workload_data,
)
from project_workload_assignment.project_workload_assignment.project_workload.models import (
	OverloadCheckFormDict,
	OverloadCheckResponse,
	ErrorOverloadResponse,
	OverloadItem,
	OverloadMonthDetail,
	OverloadMonthUser,
)

ENABLE_DEBUG_LOG = False


def _debug_log(message: str) -> None:
	if ENABLE_DEBUG_LOG:
		frappe.log(message)


def run_check_workload_overload(
	fd: OverloadCheckFormDict | None,
) -> OverloadCheckResponse | ErrorOverloadResponse:
	"""fd — dict или frappe._dict с полями project, periods, view_options."""
	if fd is None:
		fd = {}
	if not isinstance(fd, frappe._dict):
		fd = frappe._dict(fd)
	return _overload_check_impl(fd)


def _overload_check_impl(fd: frappe._dict | OverloadCheckFormDict) -> OverloadCheckResponse | ErrorOverloadResponse:
	project = fd.get('project')
	periods = fd.get('periods')
	view_options = fd.get('view_options', 'Прогноз и факт')

	_debug_log("=== STEP 1: PARAMETERS ===")
	_debug_log(f"Project: {project}")
	_debug_log(f"View options: {view_options}")
	_debug_log(f"Periods received: {periods is not None}")

	if not project:
		return {'overloads': [], 'error': 'No project specified'}

	if periods is None:
		periods = []

	periods, period_error = _resolve_periods(project, periods)
	if period_error:
		return {'overloads': [], 'error': period_error}

	periods = _filter_periods_by_view_options(periods, view_options)
	_debug_log(f"Filtered periods for view_options '{view_options}': {len(periods)}")

	if not periods:
		return {'overloads': []}

	forecast_cache = _load_forecast_cache(project)
	_debug_log(f"Forecast cache size: {len(forecast_cache)}")

	min_date = f"{periods[0]['year']}-{periods[0]['month']:02d}-01"
	max_date = frappe.utils.get_last_day(f"{periods[-1]['year']}-{periods[-1]['month']:02d}-01")
	_debug_log(f"Date range: {min_date} to {max_date}")

	workload_result = run_get_project_workload_data({
		'project': project,
		'view_type': 'monthly',
		'date_from': min_date,
		'date_to': max_date,
		'no_agg': True,
	})
	if workload_result is None:
		workload_result = {}

	if isinstance(workload_result, dict) and workload_result.get('error'):
		return {
			'overloads': [],
			'error': str(workload_result.get('error')),
			'message': workload_result.get('message'),
		}

	if not isinstance(workload_result, dict):
		return {'overloads': []}

	workload_by_task_role_month, users_by_task_role_month, all_users_by_task_role = (
		_aggregate_workload_by_task_role_month(workload_result)
	)

	overloads = _compare_with_forecast(
		workload_by_task_role_month,
		users_by_task_role_month,
		all_users_by_task_role,
		forecast_cache,
		workload_result,
	)

	client_overloads = [
		{
			'task': o['task'],
			'task_subject': o['task_subject'],
			'role': o['role'],
			'total_forecast': o['total_forecast'],
			'total_assigned': o['total_assigned'],
			'overload': o['overload'],
			'months': o['months'],
			'affected_users': len(o['users']),
		}
		for o in overloads
	]

	_debug_log(f"=== STEP 7: RESULTS ===")
	_debug_log(f"Overloads found: {len(client_overloads)}")

	return {
		'overloads': client_overloads,
		'total_overloads': len(client_overloads),
		'affected_tasks': len({o['task'] for o in client_overloads}),
		'affected_users': sum(o['affected_users'] for o in client_overloads),
	}


def _resolve_periods(
	project: str,
	periods: list[OverloadPeriodInput] | None,
) -> tuple[list[OverloadPeriodInput], str | None]:
	_debug_log("=== STEP 2: GET PERIODS ===")

	if periods and isinstance(periods, list):
		_debug_log(f"Received {len(periods)} periods")
		return periods, None

	_debug_log("No periods provided, generating from project dates")

	Project = frappe.qb.DocType('Project')
	project_rows = (
		frappe.qb.from_(Project)
		.select(Project.expected_start_date, Project.expected_end_date)
		.where(Project.name == project)
		.limit(1)
	).run(as_dict=True)

	project_data = project_rows[0] if project_rows else None
	if not project_data:
		return [], 'Project not found'

	if not project_data.get('expected_start_date'):
		return [], 'Project start date not set'

	start = frappe.utils.getdate(project_data.get('expected_start_date'))
	end = frappe.utils.getdate(
		project_data.get('expected_end_date') or frappe.utils.add_months(start, 12)
	)

	generated: list[OverloadPeriodInput] = []
	current = frappe.utils.getdate(f"{start.year}-{start.month:02d}-01")
	end_first = frappe.utils.getdate(f"{end.year}-{end.month:02d}-01")

	while current <= end_first:
		next_month = frappe.utils.add_months(current, 1)
		next_month_start = frappe.utils.getdate(f"{next_month.year}-{next_month.month:02d}-01")
		is_past = next_month_start <= frappe.utils.getdate(frappe.utils.nowdate())

		generated.append({
			'year': current.year,
			'month': current.month,
			'is_past': is_past,
		})
		current = frappe.utils.add_months(current, 1)

	_debug_log(f"Generated {len(generated)} periods")
	return generated, None


def _filter_periods_by_view_options(
	periods: list[OverloadPeriodInput],
	view_options: str,
) -> list[OverloadPeriodInput]:
	if view_options == 'Только факт':
		return []
	if view_options == 'Только прогноз':
		return periods
	return [p for p in periods if not p.get('is_past', False)]


def _load_forecast_cache(project: str) -> dict[str, float]:
	_debug_log("=== STEP 3: GET FORECAST DATA (PWE) ===")

	PWE = frappe.qb.DocType('Project Work Efforts')
	PWEA = frappe.qb.DocType('Project Work Efforts Amount')

	pwe_list = (
		frappe.qb.from_(PWE)
		.left_join(PWEA)
		.on(PWEA.parent == PWE.name)
		.select(
			PWE.pwe_task.as_('task'),
			PWE.pwe_project_role.as_('role'),
			PWEA.pwea_year.as_('year'),
			PWEA.pwea_month.as_('month'),
			PWEA.pwea_expected.as_('forecast_hours'),
		)
		.where(PWE.pwe_project == project)
		.where(PWEA.pwea_expected.isnotnull())
		.where(PWEA.pwea_expected > 0)
	).run(as_dict=True)

	_debug_log(f"Raw PWE records found: {len(pwe_list)}")

	forecast_cache: dict[str, float] = {}
	for row in pwe_list:
		if row.get('year') and row.get('month'):
			month = int(row.get('month'))
			key = f"{row.get('task')}_{row.get('role')}_{row.get('year')}_{month}"
			forecast_cache[key] = float(row.get('forecast_hours', 0))

	return forecast_cache


def _parse_period_key(period_key: str) -> tuple[int, int] | None:
	key_part = period_key.replace('workload_', '')

	if len(key_part) == 7:
		parts_date = key_part.split('-')
		return int(parts_date[0]), int(parts_date[1])
	if len(key_part) == 10:
		date_obj = frappe.utils.getdate(key_part)
		return date_obj.year, date_obj.month
	return None


def _aggregate_workload_by_task_role_month(workload_result: dict):
	_debug_log("=== STEP 5: AGGREGATE WORKLOAD BY TASK-ROLE-MONTH ===")

	workload_by_task_role_month: dict[tuple[str, str], dict[tuple[int, int], float]] = {}
	users_by_task_role_month: dict[tuple[str, str], dict[tuple[int, int], dict[str, float]]] = {}
	all_users_by_task_role: dict[tuple[str, str], set[str]] = {}

	hierarchical_task_results = workload_result.get('hierarchical_task_results') or {}
	for task_key, period_data in hierarchical_task_results.items():
		parts = task_key.split('_', 2)
		if len(parts) < 3:
			continue

		user_email = parts[0]
		role = parts[1]
		task_id = parts[2] if len(parts) > 2 else ''
		if not task_id:
			continue

		key = (task_id, role)
		workload_by_task_role_month.setdefault(key, {})
		users_by_task_role_month.setdefault(key, {})
		all_users_by_task_role.setdefault(key, set()).add(user_email)

		for period_key, hours in period_data.items():
			hours_val = float(hours) if hours else 0.0
			if hours_val <= 0:
				continue

			parsed = _parse_period_key(period_key)
			if not parsed:
				continue

			year, month = parsed
			month_key = (year, month)

			workload_by_task_role_month[key][month_key] = (
				workload_by_task_role_month[key].get(month_key, 0.0) + hours_val
			)
			users_by_task_role_month[key].setdefault(month_key, {})[user_email] = hours_val

	return workload_by_task_role_month, users_by_task_role_month, all_users_by_task_role


def _compare_with_forecast(
	workload_by_task_role_month,
	users_by_task_role_month,
	all_users_by_task_role,
	forecast_cache: dict[str, float],
	workload_result: dict,
) -> list[dict]:
	_debug_log("=== STEP 6: COMPARE WITH FORECAST ===")

	overloads = []
	tree_data = workload_result.get('tree_data') or []

	for (task, role), months_data in workload_by_task_role_month.items():
		total_assigned = 0.0
		total_forecast = 0.0
		months_details: list[OverloadMonthDetail] = []

		for (year, month), assigned_hours in months_data.items():
			forecast_key = f"{task}_{role}_{year}_{month}"
			forecast_hours = forecast_cache.get(forecast_key, 0)

			total_forecast += forecast_hours
			total_assigned += assigned_hours

			month_users: list[OverloadMonthUser] = []
			users_data = users_by_task_role_month.get((task, role), {}).get((year, month), {})
			for user_email, user_hours in users_data.items():
				month_users.append({
					'user': user_email,
					'user_full_name': user_email,
					'assigned': round(user_hours, 2),
					'workload_type': '',
					'wl_value': 0,
				})

			months_details.append({
				'year': year,
				'month': month,
				'forecast_hours': round(forecast_hours, 2),
				'assigned_hours': round(assigned_hours, 2),
				'users': month_users,
			})

		_debug_log(
			f"Task={task}, Role={role}: forecast={total_forecast:.2f}, assigned={total_assigned:.2f}"
		)

		if total_assigned > total_forecast + 1:
			overload = total_assigned - total_forecast
			_debug_log(f"  >>> OVERLOAD! overload={overload:.2f}")

			task_subject = task
			for row in tree_data:
				if row.get('task_id') == task:
					task_subject = row.get('task_subject', task)
					break

			overloads.append({
				'task': task,
				'task_subject': task_subject,
				'role': role or 'Без роли',
				'total_forecast': round(total_forecast, 2),
				'total_assigned': round(total_assigned, 2),
				'overload': round(overload, 2),
				'months': months_details,
				'users': list(all_users_by_task_role.get((task, role), set())),
			})

	return overloads
