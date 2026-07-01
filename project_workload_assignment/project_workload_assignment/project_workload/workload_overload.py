# Copyright (c) 2026, Dinext
"""Check Workload Overload V2 — ported from Server Script (ISS-2025-01239).

Сравнивает фактическую загрузку (PWA) с прогнозом (PWE) по задачам/ролям/месяцам.
Entrypoint: run_check_workload_overload(form_dict) -> dict
"""

import frappe

from project_workload_assignment.project_workload_assignment.project_workload.single_project_workload_tree import (
	run_get_project_workload_data,
)

ENABLE_DEBUG_LOG = False


def _debug_log(message):
	if ENABLE_DEBUG_LOG:
		frappe.log(message)


def run_check_workload_overload(fd) -> dict:
	"""Проверяет перегрузку назначений относительно прогноза PWE."""
	if fd is None:
		fd = {}
	if not isinstance(fd, frappe._dict):
		fd = frappe._dict(fd)

	project = fd.get('project')
	periods = fd.get('periods')
	view_options = fd.get('view_options', 'Прогноз и факт')

	_debug_log(f"Project: {project}, view_options: {view_options}, periods received: {periods is not None}")

	if not project:
		return {
			'overloads': [],
			'error': 'No project specified'
		}

	if periods is None:
		periods = []

	# ========== 1. ПОЛУЧАЕМ ПЕРИОДЫ ==========
	if not periods or not isinstance(periods, list):
		_debug_log("No periods provided, generating from project dates")

		Project = frappe.qb.DocType('Project')
		project_rows = (
			frappe.qb.from_(Project)
			.select(Project.expected_start_date, Project.expected_end_date)
			.where(Project.name == project)
			.limit(1)
		).run(as_dict=True)

		project_data = project_rows[0] if project_rows else None

		if not project_data or not project_data.get('expected_start_date'):
			return {
				'overloads': [],
				'error': 'Project start date not set' if project_data else 'Project not found'
			}

		start = frappe.utils.getdate(project_data.get('expected_start_date'))
		end = frappe.utils.getdate(
			project_data.get('expected_end_date') or frappe.utils.add_months(start, 12)
		)

		periods = []
		current = frappe.utils.getdate(f"{start.year}-{start.month:02d}-01")
		end_first = frappe.utils.getdate(f"{end.year}-{end.month:02d}-01")

		while current <= end_first:
			next_month = frappe.utils.add_months(current, 1)
			next_month_start = frappe.utils.getdate(f"{next_month.year}-{next_month.month:02d}-01")
			is_past = next_month_start <= frappe.utils.getdate(frappe.utils.nowdate())

			periods.append({
				'year': current.year,
				'month': current.month,
				'is_past': is_past
			})
			current = frappe.utils.add_months(current, 1)

		_debug_log(f"Generated {len(periods)} periods")

	# Фильтруем периоды в зависимости от view_options
	if view_options == "Только факт":
		periods = []
	elif view_options == "Только прогноз":
		pass  # без фильтра
	else:  # "Прогноз и факт"
		periods = [p for p in periods if not p.get('is_past', False)]

	_debug_log(f"Filtered periods: {len(periods)}")

	if not periods:
		return {'overloads': []}

	# ========== 2. ПОЛУЧАЕМ ПРОГНОЗНЫЕ ДАННЫЕ (PWE) ==========
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
			PWEA.pwea_expected.as_('forecast_hours')
		)
		.where(PWE.pwe_project == project)
		.where(PWEA.pwea_expected.isnotnull())
		.where(PWEA.pwea_expected > 0)
	).run(as_dict=True)

	forecast_cache = {}
	for row in pwe_list:
		if row.get('year') and row.get('month'):
			key = f"{row.get('task')}_{row.get('role')}_{row.get('year')}_{int(row.get('month'))}"
			forecast_cache[key] = float(row.get('forecast_hours', 0))

	_debug_log(f"Forecast cache size: {len(forecast_cache)}")

	# ========== 3. ПОЛУЧАЕМ ДАННЫЕ ЗАГРУЗКИ ==========
	min_date = f"{periods[0]['year']}-{periods[0]['month']:02d}-01"
	max_date = frappe.utils.get_last_day(f"{periods[-1]['year']}-{periods[-1]['month']:02d}-01")

	_debug_log(f"Date range: {min_date} to {max_date}")

	workload_fd = frappe._dict({
		'project': project,
		'view_type': 'monthly',
		'date_from': min_date,
		'date_to': str(max_date),
		'no_agg': True,
	})
	workload_result = run_get_project_workload_data(workload_fd) or {}

	if isinstance(workload_result, dict) and workload_result.get("error"):
		return {
			'overloads': [],
			'error': str(workload_result.get('error')),
			'message': workload_result.get('message'),
		}

	if not isinstance(workload_result, dict):
		return {'overloads': [], 'error': 'Unexpected workload result type'}

	# ========== 4. АГРЕГИРУЕМ ЗАГРУЗКУ ПО ЗАДАЧАМ-РОЛЯМ-МЕСЯЦАМ ==========
	workload_by_task_role_month: dict = {}
	users_by_task_role_month: dict = {}
	all_users_by_task_role: dict = {}

	hierarchical_task_results = workload_result.get("hierarchical_task_results") or {}
	for task_key, period_data in hierarchical_task_results.items():
		parts = task_key.split("_", 2)
		if len(parts) < 3:
			continue

		user_email = parts[0]
		role = parts[1]
		task_id = parts[2]

		if not task_id:
			continue

		key = (task_id, role)

		workload_by_task_role_month.setdefault(key, {})
		users_by_task_role_month.setdefault(key, {})
		all_users_by_task_role.setdefault(key, set())

		all_users_by_task_role[key].add(user_email)

		for period_key, hours in period_data.items():
			hours_val = float(hours) if hours else 0.0
			if hours_val <= 0:
				continue

			key_part = period_key.replace("workload_", "")

			if len(key_part) == 7:  # формат YYYY-MM (monthly)
				parts_date = key_part.split("-")
				year = int(parts_date[0])
				month = int(parts_date[1])
			elif len(key_part) == 10:  # формат YYYY-MM-DD
				date_obj = frappe.utils.getdate(key_part)
				year = date_obj.year
				month = date_obj.month
			else:
				continue

			month_key = (year, month)

			workload_by_task_role_month[key].setdefault(month_key, 0.0)
			users_by_task_role_month[key].setdefault(month_key, {})

			workload_by_task_role_month[key][month_key] += hours_val
			users_by_task_role_month[key][month_key][user_email] = hours_val

	# ========== 5. СРАВНИВАЕМ С ПРОГНОЗОМ ==========
	overloads = []

	for (task, role), months_data in workload_by_task_role_month.items():
		total_assigned = 0.0
		total_forecast = 0.0
		months_details = []

		for (year, month), assigned_hours in months_data.items():
			forecast_key = f"{task}_{role}_{year}_{month}"
			forecast_hours = forecast_cache.get(forecast_key, 0)

			total_forecast += forecast_hours
			total_assigned += assigned_hours

			month_users = []
			users_data = users_by_task_role_month.get((task, role), {}).get((year, month), {})
			for user_email, user_hours in users_data.items():
				month_users.append({
					'user': user_email,
					'user_full_name': user_email,
					'assigned': round(user_hours, 2),
					'workload_type': '',
					'wl_value': 0
				})

			months_details.append({
				'year': year,
				'month': month,
				'forecast_hours': round(forecast_hours, 2),
				'assigned_hours': round(assigned_hours, 2),
				'users': month_users
			})

		_debug_log(f"Task={task}, Role={role}: forecast={total_forecast:.2f}, assigned={total_assigned:.2f}")

		if total_assigned > total_forecast + 1:
			overload = total_assigned - total_forecast
			_debug_log(f"  >>> OVERLOAD! overload={overload:.2f}")

			task_subject = task
			for row in workload_result.get('tree_data', []):
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
				'users': list(all_users_by_task_role.get((task, role), set()))
			})

	client_overloads = [
		{
			'task': o['task'],
			'task_subject': o['task_subject'],
			'role': o['role'],
			'total_forecast': o['total_forecast'],
			'total_assigned': o['total_assigned'],
			'overload': o['overload'],
			'months': o['months'],
			'affected_users': len(o['users'])
		}
		for o in overloads
	]

	frappe.log(f"check_workload_overload: returning {len(client_overloads)} overloads")

	return {
		'overloads': client_overloads,
		'total_overloads': len(client_overloads),
		'affected_tasks': len(set(o['task'] for o in client_overloads)),
		'affected_users': sum(o['affected_users'] for o in client_overloads)
	}
