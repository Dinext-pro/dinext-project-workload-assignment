# Copyright (c) 2026, Dinext
"""Сетка загрузки команды: ответ API get_projects_workload_data_v2 (бывший Exp_V2).

Ядро вынесено из Server Script в это приложение (ISS-2026-00865):
`project_workload_assignment.project_workload_api.pwr_run_team_workload_grid` → этот модуль.
Тонкие обёртки остаются в Server Script на сайте (api_method без тела расчёта).

ISS-2026-00926: при merge DinextAgGrid не откатывать `_userHolidays` в project-row и пропорциональный
сплит «В рабочих часах»; UI-календарь для % — в CS (`getHolidaysForRow`). См.
`.issues/ISS-2026-00926/cross-ref-iss-2026-00865.md`.
"""

from typing import TypedDict, Literal
from datetime import date, datetime

import frappe

from project_workload_assignment.project_workload_assignment.project_workload.types import (
	AbsenceEntry,
	HolidayEntry,
	ProjectWorkloadInfo,
	UserWorkloadInfo,
)

# Алиасы для обратной совместимости TypedDict в этом модуле.
UserInfo = UserWorkloadInfo
ProjectInfo = ProjectWorkloadInfo


# ==================== TypedDict определения ====================

class TeamWorkloadFormDict(TypedDict, total=False):
	"""Параметры запроса из frappe.form_dict."""
	user: str | None
	project: str | None
	user_group: str | None
	view_type: Literal['daily', 'weekly', 'monthly']
	period_range: Literal['quarter', 'half_year', 'year']
	mode: Literal['full', 'user_totals', 'user_projects']
	detail_user: str | None
	limit: int | str
	offset: int | str


class TeamWorkloadPeriodDaily(TypedDict):
	"""Дневной период для отчёта команды."""
	key: str
	date: str
	year: int
	month: int
	day: int
	weekday: int


class TeamWorkloadPeriodWeekly(TypedDict):
	"""Недельный период для отчёта команды."""
	key: str
	year: int
	week: int
	start_date: str
	end_date: str


class TeamWorkloadPeriodMonthly(TypedDict):
	"""Месячный период для отчёта команды."""
	key: str
	year: int
	month: int
	start_date: str
	end_date: str


TeamWorkloadPeriod = TeamWorkloadPeriodDaily | TeamWorkloadPeriodWeekly | TeamWorkloadPeriodMonthly


class UserDataSummary(TypedDict):
	"""Краткие данные пользователя для tree_data."""
	full_name: str | None
	user_image: str | None
	email: str
	name: str


class TreeDataUserRow(TypedDict, total=False):
	"""Строка пользователя в tree_data."""
	participant: str
	user_data: UserDataSummary
	indent: int
	expandable: bool
	_isUser: bool
	_detailsLoaded: bool
	_email: str
	_workingHours: dict[str, float]
	_absences: list[AbsenceEntry]
	_userHolidays: list[HolidayEntry]
	workload_total: str


class TreeDataProjectRow(TypedDict, total=False):
	"""Строка проекта в tree_data."""
	participant: str
	user_data: UserDataSummary
	project: str
	project_name: str
	indent: int
	expandable: bool
	_isProject: bool
	_email: str
	_project: str
	_workingHours: dict[str, float]
	_absences: list[AbsenceEntry]
	_userHolidays: list[HolidayEntry]
	_projectHolidays: list[HolidayEntry]
	workload_total: str


class PerformanceInfo(TypedDict):
	"""Информация о производительности."""
	calculation_time_ms: float
	assignments: int
	date_calculations: int
	working_day_cache_size: int
	trace: list[str]


class TeamWorkloadResponse(TypedDict):
	"""Основной ответ API get_projects_workload_data_v2."""
	tree_data: list[TreeDataUserRow | TreeDataProjectRow]
	periods: list[TeamWorkloadPeriod]
	users_count: int
	projects_count: int
	assignments_count: int
	mode: str
	limit: int
	offset: int
	next_offset: int | None
	has_more: bool
	total_users: int
	message: str
	performance: PerformanceInfo


class ErrorTeamWorkloadResponse(TypedDict):
	"""Ответ при ошибке."""
	tree_data: list
	periods: list
	users_count: int
	projects_count: int
	assignments_count: int
	mode: str
	error: str
	message: str


def run_get_projects_workload_data_v2(fd: TeamWorkloadFormDict | None) -> TeamWorkloadResponse | ErrorTeamWorkloadResponse:
	"""fd — dict или объект с .get как frappe._dict."""
	if fd is None:
		fd = {}
	PERF_TRACE = []
	PERF_TOTAL_START = frappe.utils.now_datetime()

	def perf_log(message):
		line = "[PWR V2 PERF] " + str(message)
		PERF_TRACE.append(line)
		frappe.log(line)

	def perf_start(label):
		perf_log("START " + label)
		return frappe.utils.now_datetime()

	def perf_end(label, started_at, extra=""):
		finished_at = frappe.utils.now_datetime()
		elapsed_ms = (finished_at - started_at).total_seconds() * 1000
		suffix = ""
		if extra:
			suffix = " | " + str(extra)
		perf_log("END " + label + ": " + str(int(elapsed_ms)) + " ms" + suffix)
		return elapsed_ms

	try:
		# ISS-2026-00865 V2: режимы нужны для первичной загрузки пользователей и lazy-load проектов.
		user = fd.get('user')
		project = fd.get('project')
		user_group = fd.get('user_group')
		view_type = fd.get('view_type', 'daily')
		period_range = fd.get('period_range', 'quarter')
		mode = fd.get('mode', 'full')
		detail_user = fd.get('detail_user')
		
		try:
		    limit = int(fd.get('limit') or 20)
		except Exception:
		    limit = 20
		try:
		    offset = int(fd.get('offset') or 0)
		except Exception:
		    offset = 0
		if limit < 1:
		    limit = 20
		if limit > 100:
		    limit = 100
		if offset < 0:
		    offset = 0
		
		if mode == 'user_projects' and detail_user:
		    # Для детализации считаем только одного пользователя, сохраняя остальные фильтры.
		    user = detail_user
		
		frappe.log("Filter values - user: " + str(user) + ", project: " + str(project) + ", user_group: " + str(user_group) + ", mode: " + str(mode))
		perf_log("PARAMS mode=" + str(mode) + ", limit=" + str(limit) + ", offset=" + str(offset) + ", detail_user=" + str(detail_user) + ", view_type=" + str(view_type) + ", period_range=" + str(period_range) + ", user=" + str(user) + ", project=" + str(project) + ", user_group=" + str(user_group))
		
		# ISS-2026-00865 V2: для user_totals сначала выбираем только страницу пользователей,
		# а затем грузим назначения только по этой странице. Детализация проектов остается
		# отдельным mode=user_projects.
		user_totals_sql_paged = mode == 'user_totals'
		total_users = 0
		page_users = []
		has_more = False
		next_offset = None
		
		# ISS-2026-00865: периоды и границы SQL — project_workload_assignment.project_workload.
		early_period_start = perf_start("Generate periods early for SQL window")
		from project_workload_assignment.project_workload_assignment.project_workload.periods import generate_periods_for_pwr_report
		from project_workload_assignment.project_workload_assignment.project_workload.windows import (
		    compute_assignment_sql_lower_bound,
		    get_visible_window,
		)
		periods = generate_periods_for_pwr_report(view_type, period_range)
		display_start_win, display_end_win = get_visible_window(periods, view_type)
		assignment_lower_dt = compute_assignment_sql_lower_bound(display_start_win)
		assignment_date_to_lower_bound = frappe.utils.getdate(assignment_lower_dt)
		display_end = frappe.utils.getdate(display_end_win)
		ws = str(assignment_date_to_lower_bound)
		we = str(display_end)
		perf_end("Generate periods early for SQL window", early_period_start, "periods=" + str(len(periods)) + ", window_sql=" + str(ws) + ".." + str(we))
		
		# ========== 1. ПОЛУЧЕНИЕ ВСЕХ НЕОБХОДИМЫХ ДАННЫХ ==========
		# ISS-2026-00865 этап II: выборка назначений — project_workload_assignment.project_workload.assignments.

		use_sql_ug = bool(user_totals_sql_paged and user_group)

		assignments = []
		if user_totals_sql_paged:
		    perf_section_start = perf_start("SQL user_totals bundle")
		    from project_workload_assignment.project_workload_assignment.project_workload.assignments import fetch_pwr_user_totals_bundle

		    use_join = bool(use_sql_ug)
		    bundle = fetch_pwr_user_totals_bundle(
		        ws,
		        we,
		        limit,
		        offset,
		        user=user,
		        project=project,
		        user_group_parent=user_group,
		        use_sql_user_group_join=use_join,
		    )
		    total_users = int(bundle.get("total_users") or 0)
		    page_users = bundle.get("page_users") or []
		    assignments = bundle.get("assignments") or []
		    if offset + len(page_users) < total_users:
		        has_more = True
		        next_offset = offset + len(page_users)
		    perf_end(
		        "SQL user_totals bundle",
		        perf_section_start,
		        "total_users=" + str(total_users) + ", page_users=" + str(len(page_users)) + ", assignments=" + str(len(assignments)) + ", has_more=" + str(has_more),
		    )
		
		perf_section_start = perf_start("SQL main assignments")
		if user_totals_sql_paged:
		    pass
		elif not assignments:
		    from project_workload_assignment.project_workload_assignment.project_workload.assignments import fetch_pwr_report_assignments
		    assignments = fetch_pwr_report_assignments(
		        ws,
		        we,
		        user=user,
		        project=project,
		        user_group_parent=user_group,
		        use_sql_user_group_join=bool(use_sql_ug),
		        restrict_users=None,
		    )
		    if assignments is None:
		        assignments = []
		perf_end("SQL main assignments", perf_section_start, "rows=" + str(len(assignments)) + ", date_to_lower=" + str(assignment_date_to_lower_bound) + ", date_from_upper=" + str(display_end) + ", pre_paged_users=" + str(len(page_users)))
		
		if not assignments:
		    return  {
		        'tree_data': [], 'periods': [], 'users_count': 0,
		        'projects_count': 0, 'assignments_count': 0,
		        'message': 'No assignments found'
		    }
		
		
		# Фильтр по группе пользователей
		if user_group and not user_totals_sql_paged:
		    perf_section_start = perf_start("SQL user group members")
		    group_users_result = frappe.qb.get_query(
		        "User Group Member",
		        fields=["user"],
		        filters=[["parent", "=", user_group], ["user", "is", "set"]],
		    ).run(as_dict=True)
		    perf_end("SQL user group members", perf_section_start, "rows=" + str(len(group_users_result)))
		
		    group_users = {}
		    for row in group_users_result:
		        group_users[row['user']] = True
		
		    if group_users:
		        perf_section_start = perf_start("Python filter assignments by user_group")
		        assignments_before_group_filter = len(assignments)
		        filtered_assignments = []
		        for a in assignments:
		            if a['user'] in group_users:
		                filtered_assignments.append(a)
		        assignments = filtered_assignments
		        perf_end("Python filter assignments by user_group", perf_section_start, "before=" + str(assignments_before_group_filter) + ", after=" + str(len(assignments)))
		        if not assignments:
		            return  {
		                'tree_data': [], 'periods': [], 'users_count': 0,
		                'projects_count': 0, 'assignments_count': 0,
		                'message': 'No assignments after group filter'
		            }
		
		
		frappe.log("Found " + str(len(assignments)) + " assignments")
		
		# 1.2 Собираем уникальные сущности
		users_set = {}
		projects_set = {}
		for a in assignments:
		    users_set[a['user']] = True
		    projects_set[a['project_name']] = True
		
		if not user_totals_sql_paged:
		    all_users_list = list(users_set.keys())
		    all_users_list.sort()
		    total_users = len(all_users_list)
		    page_users = all_users_list
		    has_more = False
		    next_offset = None
		
		if mode == 'user_totals' and not user_totals_sql_paged:
		    page_users = all_users_list[offset:offset + limit]
		    if offset + limit < total_users:
		        has_more = True
		        next_offset = offset + limit
		    page_user_map = {}
		    for page_user in page_users:
		        page_user_map[page_user] = True
		    paged_assignments = []
		    for assignment in assignments:
		        if assignment['user'] in page_user_map:
		            paged_assignments.append(assignment)
		    assignments = paged_assignments
		elif mode == 'user_projects':
		    detail_user_value = detail_user or user
		    page_users = []
		    if detail_user_value:
		        page_users.append(detail_user_value)
		    page_user_map = {}
		    for page_user in page_users:
		        page_user_map[page_user] = True
		    detail_assignments = []
		    for assignment in assignments:
		        if assignment['user'] in page_user_map:
		            detail_assignments.append(assignment)
		    assignments = detail_assignments
		
		users_set = {}
		projects_set = {}
		for a in assignments:
		    users_set[a['user']] = True
		    projects_set[a['project_name']] = True
		users_list = list(users_set.keys())
		users_list.sort()
		projects_list = list(projects_set.keys())
		projects_list.sort()
		perf_log("PAGING total_users=" + str(total_users) + ", returned_users=" + str(len(users_list)) + ", has_more=" + str(has_more) + ", next_offset=" + str(next_offset))
		
		# ========== 2–3. КОНТЕКСТ РАСЧЁТА (общие loaders) ==========
		from project_workload_assignment.project_workload_assignment.project_workload.context_loaders import (
		    load_holiday_data,
		    load_monthly_plan_cache,
		    load_projects,
		    load_user_absences,
		    load_users_with_worker_context,
		    load_working_hours_overrides,
		)
		from project_workload_assignment.project_workload_assignment.project_workload.workload_engine import (
		    WorkloadContext,
		)

		perf_section_start = perf_start("Load workload context")
		users_data = load_users_with_worker_context(users_list)
		projects_data = load_projects(projects_list)
		working_hours_overrides = load_working_hours_overrides(users_data)
		holiday_lists_cache, holiday_date_sets = load_holiday_data(users_data, projects_data)
		user_absences = load_user_absences(users_list)
		monthly_plan_cache = load_monthly_plan_cache(assignments)
		perf_end(
		    "Load workload context",
		    perf_section_start,
		    "users=" + str(len(users_data))
		    + ", projects=" + str(len(projects_data))
		    + ", plans=" + str(len(monthly_plan_cache)),
		)
		
		# ========== 4. ПЕРИОДЫ ==========
		# periods уже сгенерированы в начале run (generate_periods_for_pwr_report); повторная генерация не нужна.
		frappe.log("Generated " + str(len(periods)) + " periods for view_type=" + view_type + ", range=" + period_range)
		if periods:
		    frappe.log("First period: " + str(periods[0]))
		# ISS-2026-00865: один раз строим lookup, чтобы не перебирать periods в горячих циклах.
		perf_section_start = perf_start("Build date_to_period_key")
		from project_workload_assignment.project_workload_assignment.project_workload.periods import build_date_to_period_key
		date_to_period_key = build_date_to_period_key(periods, view_type)
		if date_to_period_key is None:
		    date_to_period_key = {}
		perf_end("Build date_to_period_key", perf_section_start, "dates=" + str(len(date_to_period_key)))
		
		# ========== 5–6. РАСЧЁТ НАГРУЗКИ (WorkloadContext) ==========
		perf_section_start = perf_start("Precompute user daily hours")
		period_dates: set[str] = set()
		for period in periods:
		    if view_type == 'daily':
		        period_dates.add(period['date'])
		    else:
		        start_date = frappe.utils.getdate(period['start_date'])
		        end_date = frappe.utils.getdate(period['end_date'])
		        current_date = start_date
		        while current_date <= end_date:
		            period_dates.add(str(current_date))
		            current_date = frappe.utils.add_days(current_date, 1)

		wl_ctx = WorkloadContext(
		    users_data=users_data,
		    projects_data=projects_data,
		    working_hours_overrides=working_hours_overrides,
		    holiday_date_sets=holiday_date_sets,
		    user_absences=user_absences,
		    monthly_plan_cache=monthly_plan_cache,
		    holiday_lists_cache=holiday_lists_cache,
		)
		wl_ctx.preload_user_base_hours(users_list, period_dates)
		user_daily_hours = wl_ctx.user_daily_hours
		user_daily_hours_dates_count = sum(len(v) for v in user_daily_hours.values())
		perf_end(
		    "Precompute user daily hours",
		    perf_section_start,
		    "users=" + str(len(users_list)) + ", date_entries=" + str(user_daily_hours_dates_count),
		)

		frappe.log("Starting workload calculation with WorkloadContext...")
		perf_section_start = perf_start("Calculate workload original logic")
		start_time = frappe.utils.now_datetime()

		direct_user_totals = user_totals_sql_paged
		results: dict = {}
		assignment_calculations = 0
		workload_type_counts: dict[str, int] = {}
		period_lookup_iterations = 0

		def find_period_key(date_str: str) -> str | None:
		    nonlocal period_lookup_iterations
		    period_lookup_iterations += 1
		    return date_to_period_key.get(date_str)

		assignments_by_user_project: dict[str, dict[str, list]] = {}
		for assignment in assignments:
		    user_email = assignment['user']
		    project_name = assignment['project_name']
		    assignments_by_user_project.setdefault(user_email, {}).setdefault(project_name, []).append(assignment)

		for user_email, user_projects in assignments_by_user_project.items():
		    for project_name, user_assignments in user_projects.items():
		        if user_email not in results:
		            results[user_email] = {}
		            if direct_user_totals:
		                for p in periods:
		                    results[user_email][p['key']] = 0.0

		        if not direct_user_totals and project_name not in results[user_email]:
		            results[user_email][project_name] = {}
		            for p in periods:
		                results[user_email][project_name][p['key']] = 0.0

		        for assignment in user_assignments:
		            workload_label = assignment.get('workload') or 'Unknown'
		            workload_type_counts[workload_label] = workload_type_counts.get(workload_label, 0) + 1
		            daily_loads = wl_ctx.compute_assignment_daily_hours(assignment)
		            for date_str, daily_load in daily_loads.items():
		                period_key = find_period_key(date_str)
		                if not period_key:
		                    continue
		                assignment_calculations += 1
		                if direct_user_totals:
		                    results[user_email][period_key] += daily_load
		                else:
		                    results[user_email][project_name][period_key] += daily_load
		end_time = frappe.utils.now_datetime()
		calculation_time = (end_time - start_time).total_seconds() * 1000
		frappe.log("Calculation completed in " + str(calculation_time) + " ms, " + str(assignment_calculations) + " date calculations")
		perf_end(
		    "Calculate workload original logic",
		    perf_section_start,
		    "assignments=" + str(len(assignments))
		    + ", direct_user_totals=" + str(direct_user_totals)
		    + ", workload_types=" + str(workload_type_counts)
		    + ", period_lookup_iterations=" + str(period_lookup_iterations)
		    + ", working_day_cache_size=" + str(len(wl_ctx._working_day_cache)),
		)
		
		# ========== 7. ФОРМИРОВАНИЕ TREE DATA ==========
		
		perf_section_start = perf_start("Build tree_data response")
		tree_data = []
		user_emails_result = list(results.keys())
		user_emails_result.sort()
		return_user_rows = mode != 'user_projects'
		return_project_rows = mode != 'user_totals'
		
		for user_email in user_emails_result:
		    projects_result = results[user_email]
		
		    # Строка пользователя
		    user_total = {}
		    for p in periods:
		        user_total[p['key']] = 0.0
		
		    if direct_user_totals:
		        period_keys = list(projects_result.keys())
		        for period_key in period_keys:
		            user_total[period_key] = projects_result[period_key]
		        project_names_result = []
		    else:
		        # Суммируем нагрузку по всем проектам пользователя
		        project_names_result = list(projects_result.keys())
		        for project_name in project_names_result:
		            period_hours = projects_result[project_name]
		            period_keys = list(period_hours.keys())
		            for period_key in period_keys:
		                hours = period_hours[period_key]
		                user_total[period_key] = user_total[period_key] + hours
		
		    # Получаем данные пользователя
		    user_info = users_data.get(user_email, {})
		    if not user_info:
		        # Если пользователь не найден в users_data, создаем базовую запись
		        user_info = {
		            'full_name': user_email,
		            'user_image': None,
		            'email': user_email,
		            'name': user_email,
		            'wholiday_list': None
		        }
		
		    # Создаем строку пользователя
		    user_project_names = list(assignments_by_user_project.get(user_email, {}).keys())
		    user_has_absences = len(user_absences.get(user_email, [])) > 0
		    if direct_user_totals:
		        user_expandable = len(user_project_names) > 0 or user_has_absences
		    else:
		        user_expandable = len(project_names_result) > 0 or user_has_absences

		    user_row = {
		        'participant': user_email,
		        'user_data': {
		            'full_name': user_info.get('full_name') or user_email,
		            'user_image': user_info.get('user_image'),
		            'email': user_email,
		            'name': user_email
		        },
		        'indent': 0,
		        'expandable': user_expandable,
		        '_isUser': True,
		        '_detailsLoaded': return_project_rows,
		        '_email': user_email,
		        '_workingHours': user_daily_hours.get(user_email, {}),
		        '_absences': user_absences.get(user_email, []),
		        '_userHolidays': holiday_lists_cache.get(user_info.get('wholiday_list', ''), [])
		    }
		
		    # Добавляем нагрузку по периодам
		    user_total_sum = 0.0
		    for period in periods:
		        period_key = period['key']
		        hours = user_total.get(period_key, 0.0)
		        user_row[period_key] = "%.1f" % hours
		        user_total_sum = user_total_sum + hours
		
		    user_row['workload_total'] = "%.1f" % user_total_sum
		    if return_user_rows:
		        tree_data.append(user_row)
		
		    # Строки проектов для этого пользователя
		    project_names_result.sort()
		    for project_name in project_names_result:
		        if not return_project_rows:
		            continue
		        period_hours = projects_result[project_name]
		        project_info = projects_data.get(project_name, {})
		        if not project_info:
		            # Если проект не найден в projects_data, создаем базовую запись
		            project_info = {
		                'project_name': project_name,
		                'holiday_list': None
		            }
		
		        project_row = {
		            'participant': user_email,
		            'user_data': user_row['user_data'],
		            'project': project_info.get('project_name') or project_name,
		            'project_name': project_name,
		            'indent': 1,
		            'expandable': False,
		            '_isProject': True,
		            '_email': user_email,
		            '_project': project_name,
		            '_workingHours': user_daily_hours.get(user_email, {}),
		            '_absences': user_absences.get(user_email, []),
		            # ISS-2026-00865 #7: оба календаря в project-row; клиент объединяет для weekly/monthly %.
		            '_userHolidays': holiday_lists_cache.get(user_info.get('wholiday_list', ''), []),
		            '_projectHolidays': holiday_lists_cache.get(project_info.get('holiday_list', ''), [])
		        }
		
		        project_total = 0.0
		        for period in periods:
		            period_key = period['key']
		            hours = period_hours.get(period_key, 0.0)
		            project_row[period_key] = "%.1f" % hours
		            project_total = project_total + hours
		
		        project_row['workload_total'] = "%.1f" % project_total
		        tree_data.append(project_row)
		perf_end("Build tree_data response", perf_section_start, "mode=" + str(mode) + ", users=" + str(len(user_emails_result)) + ", rows=" + str(len(tree_data)))
		perf_end("TOTAL get_projects_workload_data_v2", PERF_TOTAL_START, "mode=" + str(mode) + ", tree_rows=" + str(len(tree_data)) + ", periods=" + str(len(periods)) + ", assignments=" + str(len(assignments)))
		frappe.log_error("\n".join(PERF_TRACE), "PWR V2 PERF get_projects_workload_data_v2")
		
		# ========== 8. ФИНАЛЬНЫЙ ОТВЕТ ==========
		
		return  {
		    'tree_data': tree_data,
		    'periods': periods,
		    'users_count': len(users_list),
		    'projects_count': len(projects_list),
		    'assignments_count': len(assignments),
		    'mode': mode,
		    'limit': limit,
		    'offset': offset,
		    'next_offset': next_offset,
		    'has_more': has_more,
		    'total_users': total_users,
		    'message': 'Data loaded successfully in ' + str(int(calculation_time)) + ' ms (CORRECTED LOGIC V2)',
		    'performance': {
		        'calculation_time_ms': calculation_time,
		        'assignments': len(assignments),
		        'date_calculations': assignment_calculations,
		        'working_day_cache_size': len(wl_ctx._working_day_cache),
		        'trace': PERF_TRACE
		    }
		}
	except Exception as e:
		try:
			perf_end("TOTAL get_projects_workload_data_v2 FAILED", PERF_TOTAL_START, "error=" + str(e))
		except Exception:
			pass
		frappe.log_error("\n".join(PERF_TRACE), "PWR V2 PERF get_projects_workload_data_v2 FAILED")
		frappe.log("Error in get_projects_workload_data_v2: " + str(e))
		return {
			"tree_data": [],
			"periods": [],
			"users_count": 0,
			"projects_count": 0,
			"assignments_count": 0,
			"mode": fd.get("mode", "full"),
			"error": str(e),
			"message": "Error loading data",
		}
