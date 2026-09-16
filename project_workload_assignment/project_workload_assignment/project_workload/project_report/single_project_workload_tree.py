# Copyright (c) 2026, Dinext
"""Дерево загрузки одного проекта: ответ API get_project_workload_data (бывший Server Script V3).

ISS-2026-00926: entrypoint `pwr_run_project_workload_tree_canonical` → reshape → этот модуль.
Расчёт через WorkloadContext (паритет с tasks_forecast / team_workload_grid).
"""

from datetime import date

import frappe
from frappe.utils.data import getdate

from project_workload_assignment.project_workload_assignment.project_workload.core.assignments import (
	fetch_project_assignments_with_worker_context,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.context_loaders import (
	load_holiday_data,
	load_monthly_plan_cache,
	load_projects,
	load_user_absences,
	load_users_with_worker_context,
	load_working_hours_overrides,
	resolve_project_holiday_list,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.types import (
	AbsenceEntry,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.team_limits import (
	load_project_team_limits,
	resolve_role_limit,
	resolve_user_limit,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.workload_engine import (
	WorkloadContext,
)
from project_workload_assignment.project_workload_assignment.project_workload.models import (
	AbsenceItem,
	FormDict,
	ProjectWorkloadResponse,
	ErrorResponse,
	TreeDataRow,
	Metadata,
	Performance,
	DebugInfo,
	Period,
	UserData,
	TaskDict,
)
from project_workload_assignment.project_workload_assignment.project_workload.project_report.task_hour_rollup import (
	period_map_has_hours,
	rollup_task_period_hours,
)



def _parse_bool_form_value(value, default: bool = False) -> bool:
	if value is None:
		return default
	if isinstance(value, bool):
		return value
	if isinstance(value, (int, float)):
		return bool(value)
	if isinstance(value, str):
		return value.strip().lower() in ("1", "true", "yes", "on")
	return default


def _dates_in_periods(periods: list, view_type: str) -> set[str]:
	"""Все календарные даты, покрываемые колонками отчёта."""
	dates: set[str] = set()
	for period in periods:
		if view_type == "daily":
			dates.add(period["date"])
			continue
		start = getdate(period["start_date"])
		end = getdate(period["end_date"])
		current = start
		while current <= end:
			dates.add(str(current))
			current = frappe.utils.add_days(current, 1)
	return dates


def _assignment_calendar_bounds(
	assignments_data: list,
	display_start: date,
	display_end: date,
) -> tuple[date, date]:
	"""Min/max дат для контекста: окно отчёта ∪ span всех PWA."""
	calendar_min = display_start
	calendar_max = display_end
	for assignment in assignments_data:
		date_from = getdate(assignment.date_from)
		date_to = getdate(assignment.date_to)
		if date_from < calendar_min:
			calendar_min = date_from
		if date_to > calendar_max:
			calendar_max = date_to
	return calendar_min, calendar_max


def _filter_holidays_for_range(
	holiday_lists_cache: dict,
	list_name: str | None,
	range_start: date,
	range_end: date,
) -> list:
	if not list_name or list_name not in holiday_lists_cache:
		return []
	return [
		entry
		for entry in holiday_lists_cache[list_name]
		if range_start <= getdate(entry.get("date")) <= range_end
	]


def _absences_to_metadata(
	user_absences: dict[str, list[AbsenceEntry]],
) -> dict[str, list[AbsenceItem]]:
	metadata: dict[str, list[AbsenceItem]] = {}
	for user_email, entries in user_absences.items():
		metadata[user_email] = [
			{
				"from_date": entry.get("from_date"),
				"to_date": entry.get("to_date"),
				"type": entry.get("type") or "",
				"alfrom_hours": entry.get("alfrom_hours"),
				"alto_hours": entry.get("alto_hours"),
			}
			for entry in entries
		]
	return metadata


def run_get_project_workload_data(fd: FormDict | None) -> ProjectWorkloadResponse | ErrorResponse:
	"""fd — dict или объект с .get как frappe._dict."""
	if fd is None:
		fd = {}

	def logger(message):
		pass

	try:
		# Получаем параметры
		project = fd.get('project')
		view_type = fd.get('view_type', 'daily')
		date_from = fd.get('date_from')
		date_to = fd.get('date_to')
		no_agg = _parse_bool_form_value(fd.get('no_agg'), default=False)
		load_actual = _parse_bool_form_value(fd.get('load_actual'), default=False)
		from project_workload_assignment.project_workload_assignment.project_workload.core.worker_wtype_helpers import (
			filter_users_by_wtype,
			normalize_worker_wtype_filter,
		)
		from project_workload_assignment.project_workload_assignment.project_workload.core.project_role_helpers import (
			normalize_project_role_filters,
		)
		from project_workload_assignment.project_workload_assignment.project_workload.core.context_loaders import (
			load_worker_wtypes,
		)

		worker_wtype_filter = normalize_worker_wtype_filter(fd.get('worker_wtype'))
		project_role_filters = normalize_project_role_filters(fd.get('project_role_filters'))
		
		logger(f"Project: {project}, View Type: {view_type}, Period: {date_from} to {date_to}")
		
		if not project:
			return {
				'tree_data': [], 
				'periods': [],
				'users_count': 0,
				'tasks_count': 0,
				'assignments_count': 0,
				'message': 'No project specified'
			}
		
		# ========== 1. ОПТИМИЗИРОВАННОЕ ПОЛУЧЕНИЕ ДАННЫХ ПРОЕКТА ==========
		
		project_data = frappe.db.get_value('Project', project, 
			['expected_start_date', 'expected_end_date', 'holiday_list', 'company'], as_dict=True)
		
		if not project_data:
			return {
				'tree_data': [], 
				'periods': [],
				'users_count': 0,
				'tasks_count': 0,
				'assignments_count': 0,
				'message': 'Project not found'
			}
		
		project_data = frappe._dict(project_data)
		project_start_date = project_data.expected_start_date or frappe.utils.nowdate()
		project_end_date = project_data.expected_end_date or frappe.utils.add_days(project_start_date, 90)
		project_holiday_list = project_data.holiday_list
		if not project_holiday_list and project_data.company:
			project_holiday_list = frappe.db.get_value(
				"Company", project_data.company, "default_holiday_list"
			)
		
		logger(f"Project dates - Start: {project_start_date}, End: {project_end_date}, Holiday List: {project_holiday_list}")
		
		# ========== 2. ОПРЕДЕЛЕНИЕ ПЕРИОДА ОТОБРАЖЕНИЯ ==========
		
		# Если даты не указаны, используем текущую дату и +1 месяц
		if not date_from:
			date_from = frappe.utils.nowdate()
		
		if not date_to:
			date_to = frappe.utils.add_months(date_from, 1)
			# Если дата окончания проекта раньше, используем ее
			if project_end_date and project_end_date < date_to:
				date_to = project_end_date
		
		# Преобразуем строки в даты
		start_date_obj = frappe.utils.getdate(date_from)
		end_date_obj = frappe.utils.getdate(date_to)
		
		# Проверяем корректность диапазона
		if start_date_obj > end_date_obj:
			# Меняем местами если нужно
			start_date_obj, end_date_obj = end_date_obj, start_date_obj
			date_from, date_to = date_to, date_from
		
		# Ограничиваем максимальный период (макс 365 дней для производительности)
		max_days = min(365, (end_date_obj - start_date_obj).days + 1)
		if max_days < 1:
			return {
				'tree_data': [], 
				'periods': [],
				'users_count': 0,
				'tasks_count': 0,
				'assignments_count': 0,
				'message': 'Invalid date range'
			}
		
		logger(f"Display period - From: {date_from}, To: {date_to}, Days: {max_days}")
		
		# ========== 3. НАЗНАЧЕНИЯ: общая выборка project_workload_assignment (ISS-2026-00865 этап II) ==========
		
		assignments_data = fetch_project_assignments_with_worker_context(
			project,
			str(date_from),
			str(date_to),
			project_role_filters=project_role_filters or None,
		)
		if assignments_data is None:
			assignments_data = []
		assignments_data = [frappe._dict(a) for a in assignments_data]		
		if not assignments_data:
			return {
				'tree_data': [], 
				'periods': [],
				'users_count': 0,
				'tasks_count': 0,
				'assignments_count': 0,
				'message': 'No assignments found for project'
			}
		
		logger(f"Found {len(assignments_data)} assignments")
		
		# ========== 4. НОВАЯ ТРЕХУРОВНЕВАЯ ГРУППИРОВКА (ПОЛЬЗОВАТЕЛЬ -> РОЛЬ -> ЗАДАЧА) ==========
		
		assignments_by_user_role_task = {}
		users_data = {}
		unique_tasks = set()
		
		logger(f"Начинаем группировку {len(assignments_data)} назначений по пользователям, ролям и задачам")
		
		for assignment in assignments_data:
			user_email = assignment.user
			role = assignment.role or 'No Role'
			task_id = assignment.task_id
			task_subject = assignment.task_subject or f"Задача {task_id}"
		
			# Сохраняем данные пользователя
			if user_email not in users_data:
				users_data[user_email] = {
					'full_name': assignment.full_name or user_email,
					'user_image': assignment.user_image,
					'email': user_email,
					'name': user_email,
					'wholiday_list': assignment.wholiday_list,
					'wtimesheet_template': assignment.wtimesheet_template,
					'hours_on_date': assignment.hours_on_date,
					'tt_working_hours_on_date': assignment.tt_working_hours_on_date
				}
				logger(f"Добавлен пользователь: {user_email}")
		
			# Трехуровневая структура: пользователь -> роль -> задача
			if user_email not in assignments_by_user_role_task:
				assignments_by_user_role_task[user_email] = {}
		
			if role not in assignments_by_user_role_task[user_email]:
				assignments_by_user_role_task[user_email][role] = {}
		
			if task_id not in assignments_by_user_role_task[user_email][role]:
				assignments_by_user_role_task[user_email][role][task_id] = {
					'task_subject': task_subject,
					'assignments': []
				}
		
			assignments_by_user_role_task[user_email][role][task_id]['assignments'].append(assignment)
			unique_tasks.add(task_id)
		
		users_list = list(users_data.keys())
		if worker_wtype_filter:
			wtypes_map = load_worker_wtypes(users_list)
			filtered_users = set(
				filter_users_by_wtype(users_list, worker_wtype_filter, users_data, wtypes_map)
			)
			users_list = [user_email for user_email in users_list if user_email in filtered_users]
			assignments_by_user_role_task = {
				user_email: roles
				for user_email, roles in assignments_by_user_role_task.items()
				if user_email in filtered_users
			}
		logger(f"Группировка завершена. Пользователей: {len(users_list)}, задач: {len(unique_tasks)}")
		
		# ========== 4.5 ПОЛУЧЕНИЕ ДЕРЕВА ЗАДАЧ ПРОЕКТА (через frappe.qb) ==========
		
		Task = frappe.qb.DocType("Task")
		
		tasks_query = (
			frappe.qb.from_(Task)
			.select(
				Task.name.as_("task_id"),
				Task.subject.as_("task_subject"),
				Task.parent_task.as_("parent_task_id"),
				Task.status,
				Task.exp_start_date,
				Task.exp_end_date
			)
			.where(Task.project == project)
			.orderby(Task.lft)
		)
		
		all_tasks = tasks_query.run(as_dict=True)
		logger(f"Найдено задач в проекте: {len(all_tasks)}")
		
		# Строим словарь задач для быстрого доступа
		tasks_dict = {}
		for task in all_tasks:
			tasks_dict[task.task_id] = {
				'task_id': task.task_id,
				'task_subject': task.task_subject,
				'parent_task_id': task.parent_task_id,
				'children': [],
				'has_direct_load': False,  # Будет установлено позже
				'exp_start_date': str(task.exp_start_date) if task.exp_start_date else None,
				'exp_end_date': str(task.exp_end_date) if task.exp_end_date else None,
			}
		
		# Строим иерархию (заполняем children)
		root_tasks = []
		for task_id, task_info in tasks_dict.items():
			parent_id = task_info['parent_task_id']
			if parent_id and parent_id in tasks_dict:
				tasks_dict[parent_id]['children'].append(task_id)
			else:
				root_tasks.append(task_id)
		
		logger(f"Построено дерево задач. Корневых задач: {len(root_tasks)}")
		
		# Определяем, у каких задач есть прямая загрузка (назначения)
		tasks_with_direct_load = set()
		for assignment in assignments_data:
			tasks_with_direct_load.add(assignment.task_id)
		
		for task_id in tasks_with_direct_load:
			if task_id in tasks_dict:
				tasks_dict[task_id]['has_direct_load'] = True
		
		logger(f"Задач с прямой загрузкой: {len(tasks_with_direct_load)}")
		
		# ========== 5. ОПТИМИЗИРОВАННАЯ ГЕНЕРАЦИЯ ПЕРИОДОВ (КАК В РЕФЕРЕНСЕ) ==========
		
		periods = []
		
		if view_type == 'daily':
			current_date = start_date_obj
			# Ограничиваем количество периодов для оптимизации (макс 365 дней)
			for i in range(max_days):
				if current_date > end_date_obj:
					break
		
				date_str = str(current_date)
				periods.append({
					'key': 'workload_' + date_str,
					'date': date_str,
					'year': current_date.year,
					'month': current_date.month,
					'day': current_date.day,
					'weekday': current_date.weekday()
				})
				current_date = frappe.utils.add_days(current_date, 1)
		
		elif view_type == 'weekly':
			# Генерация недельных периодов КАК В РЕФЕРЕНСЕ
			# Находим начало недели (понедельник) ОТНОСИТЕЛЬНО ТЕКУЩЕЙ ДАТЫ
			current_date = start_date_obj
			days_to_monday = current_date.weekday()  # weekday: 0 = Monday, 6 = Sunday
			week_start = frappe.utils.add_days(current_date, -days_to_monday)
		
			# Считаем количество недель, которое нужно отобразить
			# Определяем количество полных недель от week_start до end_date_obj
			days_diff = (end_date_obj - week_start).days
			weeks_count = (days_diff // 7) + 1
		
			for i in range(weeks_count):
				week_start_date = frappe.utils.add_days(week_start, i * 7)
				week_end_date = frappe.utils.add_days(week_start_date, 6)  # Воскресенье
		
				# ВАЖНО: Всегда добавляем ПОЛНУЮ неделю, даже если она начинается до start_date_obj
				# Это обеспечит правильный расчет для дней в прошлом (9.03 и 10.03)
				periods.append({
					'key': f"workload_{week_start_date.year}-W{week_start_date.isocalendar()[1]:02d}",
					'date': str(week_start_date),  # Для обратной совместимости
					'start_date': str(week_start_date),
					'end_date': str(week_end_date),
					'year': week_start_date.year,
					'week': week_start_date.isocalendar()[1],
					'week_start': str(week_start_date),
					'week_end': str(week_end_date)
				})
		
				# Безопасность: ограничиваем количество недель
				if len(periods) > 156:  # ~3 года
					break
		
		elif view_type == 'monthly':
			# Генерация месячных периодов
			current_date = start_date_obj
		
			# Находим первый день месяца для начальной даты
			month_start = frappe.utils.getdate(f"{current_date.year}-{current_date.month:02d}-01")
		
			# Генерируем месяцы пока не достигнем end_date_obj
			while month_start <= end_date_obj:
				month_end = frappe.utils.get_last_day(month_start)
		
				# ВАЖНО: Всегда добавляем ПОЛНЫЙ месяц
				periods.append({
					'key': f"workload_{month_start.year}-{month_start.month:02d}",
					'date': str(month_start),
					'start_date': str(month_start),
					'end_date': str(month_end),
					'year': month_start.year,
					'month': month_start.month,
					'month_start': str(month_start),
					'month_end': str(month_end)
				})
		
				# Переходим к следующему месяцу
				if month_start.month == 12:
					month_start = frappe.utils.getdate(f"{month_start.year + 1}-01-01")
				else:
					month_start = frappe.utils.getdate(f"{month_start.year}-{month_start.month + 1:02d}-01")
		
				# Безопасность: ограничиваем количество месяцев
				if len(periods) > 60:  # 5 лет
					break
		
		logger(f"Generated {len(periods)} periods for {view_type} view")
		
		# ========== 6. КОНТЕКСТ РАСЧЁТА (WorkloadContext) ==========

		users_data_ctx = load_users_with_worker_context(users_list)
		for user_email in users_list:
			asn = users_data.get(user_email, {})
			if user_email not in users_data_ctx:
				users_data_ctx[user_email] = asn
				continue
			ctx = users_data_ctx[user_email]
			if not ctx.get("full_name"):
				ctx["full_name"] = asn.get("full_name")
			if not ctx.get("user_image"):
				ctx["user_image"] = asn.get("user_image")
		users_data = users_data_ctx

		projects_data = load_projects([project])
		project_info = projects_data.get(project, {})
		effective_project_holiday_list = (
			project_info.get("effective_holiday_list")
			or resolve_project_holiday_list(project_info)
			or project_holiday_list
		)

		working_hours_overrides = load_working_hours_overrides(users_data)
		holiday_lists_cache, holiday_date_sets = load_holiday_data(users_data, projects_data)

		calendar_min, calendar_max = _assignment_calendar_bounds(
			assignments_data, start_date_obj, end_date_obj
		)
		user_absences_raw = load_user_absences(users_list, min_end_date=calendar_min)
		user_absences = _absences_to_metadata(user_absences_raw)

		engine_assignments = []
		for user_email, roles in assignments_by_user_role_task.items():
			for role, tasks in roles.items():
				for task_id, task_data in tasks.items():
					for assignment in task_data["assignments"]:
						engine_assignments.append({
							"task": assignment.task_id,
							"role": role,
							"user": user_email,
							"date_from": assignment.date_from,
							"date_to": assignment.date_to,
							"workload": assignment.workload,
							"wl_value": assignment.wl_value,
							"project_name": project,
							"project": project,
						})

		monthly_plan_cache = load_monthly_plan_cache(engine_assignments)
		period_dates = _dates_in_periods(periods, view_type)

		wl_ctx = WorkloadContext(
			users_data=users_data,
			projects_data=projects_data,
			working_hours_overrides=working_hours_overrides,
			holiday_date_sets=holiday_date_sets,
			user_absences=user_absences_raw,
			monthly_plan_cache=monthly_plan_cache,
			holiday_lists_cache=holiday_lists_cache,
		)
		wl_ctx.preload_user_base_hours(users_list, period_dates)

		user_daily_hours = {}
		for user_email in users_list:
			user_daily_hours[user_email] = {
				date_str: wl_ctx.get_base_hours(user_email, date_str)
				for date_str in period_dates
			}

		user_holidays_for_client = {}
		for user_email in users_list:
			user_hl = users_data.get(user_email, {}).get("wholiday_list")
			user_holidays_for_client[user_email] = [
				{
					"date": entry.get("date"),
					"weekly_off": bool(entry.get("weekly_off")),
				}
				for entry in _filter_holidays_for_range(
					holiday_lists_cache, user_hl, start_date_obj, end_date_obj
				)
			]

		project_holidays_for_client = _filter_holidays_for_range(
			holiday_lists_cache,
			effective_project_holiday_list,
			start_date_obj,
			end_date_obj,
		)
		project_weekly_off_set = {
			entry.get("date")
			for entry in project_holidays_for_client
			if entry.get("weekly_off")
		}

		# ========== 7. РАСЧЁТ НАГРУЗКИ (WorkloadContext) ==========

		logger("Starting workload calculation with WorkloadContext...")
		start_time = frappe.utils.now_datetime()

		results = {}
		task_results = {}
		hierarchical_task_results = {}
		workload_calculations = 0

		date_to_period_key = {}
		if view_type == "daily":
			for period in periods:
				date_to_period_key[period["date"]] = period["key"]
		else:
			for period in periods:
				span_start = getdate(period["start_date"])
				span_end = getdate(period["end_date"])
				current = span_start
				while current <= span_end:
					date_to_period_key[str(current)] = period["key"]
					current = frappe.utils.add_days(current, 1)

		for user_email, roles in assignments_by_user_role_task.items():
			for role, tasks in roles.items():
				if user_email not in results:
					results[user_email] = {}
				if role not in results[user_email]:
					results[user_email][role] = {p["key"]: 0.0 for p in periods}
				role_result = results[user_email][role]

				for task_id, task_data in tasks.items():
					task_key = f"{user_email}_{role}_{task_id}"
					if task_key not in task_results:
						task_results[task_key] = {p["key"]: 0.0 for p in periods}
					task_result = task_results[task_key]

					for assignment in task_data["assignments"]:
						engine_input = {
							"task": assignment.task_id,
							"role": role,
							"user": user_email,
							"date_from": assignment.date_from,
							"date_to": assignment.date_to,
							"workload": assignment.workload,
							"wl_value": assignment.wl_value,
							"project_name": project,
							"project": project,
						}
						daily_loads = wl_ctx.compute_assignment_daily_hours(engine_input)
						for date_str, daily_load in daily_loads.items():
							if daily_load <= 0:
								continue
							period_key = date_to_period_key.get(date_str)
							if not period_key:
								continue
							workload_calculations += 1
							role_result[period_key] = role_result.get(period_key, 0.0) + daily_load
							task_result[period_key] = task_result.get(period_key, 0.0) + daily_load
		# ШАГ 2: Аккумуляция нагрузки в иерархии задач (полный parent_task chain)
		logger("Starting task hierarchy accumulation...")
		period_keys = [p["key"] for p in periods]
		hierarchical_task_results = {}

		for user_email, roles in assignments_by_user_role_task.items():
			for role, tasks in roles.items():
				all_task_ids = set(tasks.keys())
				additional_parents = set()
				for task_id in tasks.keys():
					current_id = task_id
					while current_id in tasks_dict and tasks_dict[current_id]["parent_task_id"]:
						parent_id = tasks_dict[current_id]["parent_task_id"]
						additional_parents.add(parent_id)
						current_id = parent_id
				all_task_ids.update(additional_parents)
				logger(
					f"Роль {role}: задач с прямыми назначениями: {len(tasks.keys())}, "
					f"всего задач в иерархии: {len(all_task_ids)}"
				)

				memo = {}
				for task_id in all_task_ids:
					rollup_task_period_hours(
						task_id,
						tasks_dict=tasks_dict,
						task_results=task_results,
						user_email=user_email,
						role=role,
						period_keys=period_keys,
						memo=memo,
					)
				for task_id, hours in memo.items():
					hierarchical_task_results[f"{user_email}_{role}_{task_id}"] = hours
					if period_map_has_hours(hours):
						task_info = tasks_dict.get(task_id, {})
						logger(
							f"Аккумулировано {sum(hours.values()):.1f} ч для задачи "
							f"{task_info.get('task_subject', task_id)} (роль {role})"
						)

		logger(f"Task hierarchy accumulation completed. Total task results: {len(hierarchical_task_results)}")
		
		end_time = frappe.utils.now_datetime()
		time_diff = end_time - start_time
		calculation_time = time_diff.total_seconds() * 1000
		
		logger(f"Calculation completed in {calculation_time:.2f} ms, {workload_calculations} calculations")
		
		# Логируем статистику по задачам для отладки
		logger(f"Task results calculated for {len(task_results)} tasks")
		
		# ========== 9. УДАЛЕН БЛОК ГАНТА ==========
		# Блок создания данных для Ганта полностью удален
		
		# ========== 10. ФОРМИРОВАНИЕ TREE DATA С ИЕРАРХИЕЙ ЗАДАЧ ==========
		
		tree_data = []
		
		def count_direct_task_children(role_row_index):
			"""Считает задачи первого уровня под строкой роли (после фильтрации по нагрузке)."""
			count = 0
			for i in range(role_row_index + 1, len(tree_data)):
				row = tree_data[i]
				if row.get('level') in ('user', 'role'):
					break
				if row.get('level') == 'task' and row.get('indent') == 2:
					count += 1
			return count
		
		team_limits = load_project_team_limits(project, start_date_obj, end_date_obj)

		# Функция для рекурсивного добавления задач в tree_data
		def add_task_to_tree(task_id, role, user_email, user_row_data, indent_level, parent_role_row):
			"""Рекурсивно добавляет задачу и всех её детей в tree_data"""
			if task_id not in tasks_dict:
				return
		
			task_info = tasks_dict[task_id]
			task_key = f"{user_email}_{role}_{task_id}"

			task_periods = hierarchical_task_results.get(task_key) or task_results.get(task_key) or {}
			if period_map_has_hours(task_periods):
				total = sum(float(v or 0) for v in task_periods.values())
				logger(
					f"Задача {task_info['task_subject']}: иерархическая загрузка ({total:.1f} ч)"
				)
			else:
				logger(f"Задача {task_info['task_subject']}: нет загрузки")

			if not task_periods:
				task_periods = {p["key"]: 0.0 for p in periods}

			children_with_load = []
			if task_info["children"]:
				for child_id in task_info["children"]:
					child_key = f"{user_email}_{role}_{child_id}"
					child_periods = hierarchical_task_results.get(child_key) or task_results.get(
						child_key
					)
					if period_map_has_hours(child_periods):
						children_with_load.append(child_id)
		
			# Если у задачи нет своей нагрузки и нет детей с нагрузкой - не показываем
			has_own_load = any(task_periods.values())
			if not has_own_load and not children_with_load:
				return
		
			# Создаем строку задачи
			task_row = {
				'participant': user_email,
				'user_data': user_row_data,
				'role': role,
				'task_id': task_id,
				'task_subject': task_info['task_subject'],
				'exp_start_date': task_info.get('exp_start_date'),
				'exp_end_date': task_info.get('exp_end_date'),
				'indent': indent_level,
				'expandable': len(children_with_load) > 0,  # Раскрываем только если есть дети с нагрузкой
				'isTask': True,
				'email': user_email,
				'roleName': role,
				'level': 'task',
				'has_direct_load': task_info['has_direct_load'],
				'workload_limit': resolve_role_limit(team_limits, user_email, role),
			}
		
			# Данные задачи по периодам
			task_total_hours = 0.0
			for period in periods:
				hours = task_periods.get(period['key'], 0.0)
				task_row[period['key']] = f"{hours:.1f}"
				task_total_hours = task_total_hours + hours
		
			task_row['workload_total'] = f"{task_total_hours:.1f}"
			if load_actual:
				apply_actual_fields_to_row(
					task_row,
					periods,
					(actual_by_user_task.get(user_email, {}) or {}).get(task_id, {}),
				)
			tree_data.append(task_row)
			logger(f"Добавлена задача: {task_info['task_subject']} (indent: {indent_level}, expandable: {len(children_with_load) > 0}, прямая загрузка: {task_info['has_direct_load']})")
		
			# Рекурсивно добавляем только дочерние задачи с нагрузкой
			if children_with_load:
				for child_id in sorted(children_with_load):  # сортируем для стабильности
					add_task_to_tree(child_id, role, user_email, user_row_data, indent_level + 1, parent_role_row)
		
		# Основной цикл по пользователям
		actual_by_user: dict[str, dict[str, float]] = {}
		actual_by_user_task: dict[str, dict[str, dict[str, float]]] = {}
		if load_actual:
			from project_workload_assignment.project_workload_assignment.project_workload.utilization.utp_actual import (
				apply_actual_fields_to_row,
				compute_project_actual_hours,
			)

			actual_by_user, actual_by_user_task = compute_project_actual_hours(
				project,
				periods,
				view_type,
				users_list,
			)

		for user_email in users_list:
			user_info = users_data[user_email]
			user_roles = results.get(user_email, {})
		
			# Строка пользователя (уровень 0)
			user_row = {
				'participant': user_email,
				'user_data': {
					'full_name': user_info['full_name'],
					'user_image': user_info['user_image'],
					'email': user_email
				},
				'indent': 0,
				'expandable': False,
				'isUser': True,
				'email': user_email,
				'level': 'user',
				'workload_limit': resolve_user_limit(
					team_limits, user_email, list(user_roles.keys())
				),
			}
		
			# Общая нагрузка пользователя
			user_total_hours = 0.0
			for period in periods:
				period_hours = 0.0
				for role_data in user_roles.values():
					period_hours = period_hours + role_data.get(period['key'], 0.0)
		
				user_row[period['key']] = f"{period_hours:.1f}"
				user_total_hours = user_total_hours + period_hours
		
			user_row['workload_total'] = f"{user_total_hours:.1f}"
			if load_actual:
				apply_actual_fields_to_row(user_row, periods, actual_by_user.get(user_email, {}))
			tree_data.append(user_row)
			logger(f"Добавлен пользователь: {user_email}")
			roles_added_for_user = 0
		
			# Роли пользователя (уровень 1)
			for role, role_data in user_roles.items():
				# Находим ВСЕ задачи для этой роли, включая родительские
				# Сначала собираем все task_id, которые есть в назначениях для этой роли
				tasks_with_assignments = set(assignments_by_user_role_task.get(user_email, {}).get(role, {}).keys())
		
				# Теперь нужно найти все родительские задачи, которые ведут к этим задачам
				all_relevant_tasks = set(tasks_with_assignments)
		
				# Для каждой задачи с назначением, добавляем всех её родителей
				for task_id in tasks_with_assignments:
					current_id = task_id
					while current_id in tasks_dict and tasks_dict[current_id]['parent_task_id']:
						parent_id = tasks_dict[current_id]['parent_task_id']
						all_relevant_tasks.add(parent_id)
						current_id = parent_id
		
				logger(f"Роль {role}: задач с назначениями: {len(tasks_with_assignments)}, всего релевантных задач: {len(all_relevant_tasks)}")
		
				# Если нет релевантных задач для этой роли, пропускаем роль
				if not all_relevant_tasks:
					continue
		
				# Строка роли
				role_row = {
					'participant': user_email,
					'user_data': user_row['user_data'],
					'role': role,
					'indent': 1,
					'expandable': False,
					'isRole': True,
					'email': user_email,
					'roleName': role,
					'level': 'role',
					'workload_limit': resolve_role_limit(team_limits, user_email, role),
				}
		
				# Нагрузка по роли
				role_total_hours = 0.0
				for period in periods:
					hours = role_data.get(period['key'], 0.0)
					role_row[period['key']] = f"{hours:.1f}"
					role_total_hours = role_total_hours + hours
		
				role_row['workload_total'] = f"{role_total_hours:.1f}"
				if load_actual:
					role_actual: dict[str, float] = {}
					for task_id in tasks_with_assignments:
						for pk, hours in (actual_by_user_task.get(user_email, {}).get(task_id, {}) or {}).items():
							role_actual[pk] = role_actual.get(pk, 0.0) + hours
					apply_actual_fields_to_row(role_row, periods, role_actual)
				tree_data.append(role_row)
				role_row_index = len(tree_data) - 1
				logger(f"Добавлена роль: {role}")
		
				# Находим корневые задачи для этой роли (те, у которых нет родителя или родитель не в all_relevant_tasks)
				root_tasks_for_role = []
				for task_id in all_relevant_tasks:
					task_info = tasks_dict.get(task_id, {})
					parent_id = task_info.get('parent_task_id')
					# Если нет родителя или родитель не в нашем наборе релевантных задач - это корень
					if not parent_id or parent_id not in all_relevant_tasks:
						root_tasks_for_role.append(task_id)
		
				# Сортируем корневые задачи для стабильного отображения
				root_tasks_for_role.sort()
				logger(f"Роль {role}: корневых задач: {len(root_tasks_for_role)} -> {[tasks_dict.get(t, {}).get('task_subject', t) for t in root_tasks_for_role]}")
		
				# Рекурсивно добавляем задачи, начиная с корневых
				for task_id in root_tasks_for_role:
					add_task_to_tree(
						task_id, 
						role, 
						user_email, 
						user_row['user_data'], 
						2,  # начальный отступ для задач
						role_row
					)
		
				visible_root_tasks = count_direct_task_children(role_row_index)
				role_row['expandable'] = visible_root_tasks > 0
				logger(
					f"Роль {role}: expandable={role_row['expandable']} "
					f"(видимых корневых задач: {visible_root_tasks})"
				)
				roles_added_for_user += 1
		
			user_row['expandable'] = roles_added_for_user > 0
		
		logger(f"Generated tree data with {len(tree_data)} rows (including task hierarchy)")

		hierarchical_task_results_response = (
			{k: dict(v) for k, v in task_results.items()}
			if no_agg
			else hierarchical_task_results
		)
		
		# ========== 11. ПОДГОТОВКА МЕТАДАННЫХ ==========
		
		# ========== 12. ФИНАЛЬНЫЙ ОТВЕТ ==========
		
		return {
			'tree_data': tree_data,
			'task_results': task_results,		   # ← добавить
			'hierarchical_task_results': hierarchical_task_results_response,
			'periods': periods,
			'users_count': len(users_list),
			'tasks_count': len(unique_tasks),
			'assignments_count': len(assignments_data),
			'metadata': {
				'project_holidays': project_holidays_for_client,
				'user_holidays': user_holidays_for_client,
				'user_absences': user_absences,
				'user_daily_hours': user_daily_hours,
				'monthly_plans_count': len(monthly_plan_cache),
				'project_dates': {
					'start_date': str(project_start_date),
					'end_date': str(project_end_date)
				},
				'display_dates': {
					'date_from': date_from,
					'date_to': date_to
				}
			},
			'message': f'Project workload data loaded in {int(calculation_time)} ms',
			'performance': {
				'calculation_time_ms': calculation_time,
				'assignments': len(assignments_data),
				'workload_calculations': workload_calculations
				# 'month_working_days_cache_size': len(month_working_days_cache)  # ← УДАЛЕНО
			},
			'debug_info': {
				'weekend_logic': 'WorkloadContext + context_loaders (единый движок с P&L и сеткой команды)',
				'loading_types_supported': ['В рабочих часах', 'В % от фонда рабочих часов', 'В % от трудоемкости задачи'],
				'project_weekly_off_dates_count': len(project_weekly_off_set),
				'monthly_plans_loaded': len(monthly_plan_cache),
				'structure': '3-level (user -> role -> task)'
			}
		}
	except Exception as e:
		frappe.log_error("Error in get_project_workload_data", str(e))
		return {
			"tree_data": [],
			"periods": [],
			"users_count": 0,
			"tasks_count": 0,
			"assignments_count": 0,
			"error": str(e),
			"message": "Error loading project workload data",
		}
