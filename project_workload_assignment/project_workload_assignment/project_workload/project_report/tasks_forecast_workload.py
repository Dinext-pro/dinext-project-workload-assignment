# Copyright (c) 2026, Dinext
"""Прогноз PWE и распределение нагрузки PWA по задачам проекта (API get_tasks_forecast_and_workload)."""

from __future__ import annotations

import frappe
from frappe.utils.data import getdate

from project_workload_assignment.project_workload_assignment.project_workload.core.context_loaders import (
	load_holiday_data,
	load_monthly_plan_cache,
	load_projects,
	load_user_absences,
	load_users_with_worker_context,
	load_working_hours_overrides,
)
from project_workload_assignment.project_workload_assignment.project_workload.core.workload_engine import (
	WorkloadContext,
)
from project_workload_assignment.project_workload_assignment.project_workload.models import (
	ForecastFormDict,
	ForecastPeriod,
	TasksForecastResponse,
	ErrorTasksResponse,
	TaskAggregated,
	TaskDetails,
)


def run_get_tasks_forecast_and_workload(fd: ForecastFormDict | None) -> TasksForecastResponse | ErrorTasksResponse:
	"""fd — dict или frappe._dict с полями project, periods, view_options."""
	if fd is None:
		fd = {}
	if not isinstance(fd, frappe._dict):
		fd = frappe._dict(fd)
	return _tasks_forecast_impl(fd)

# Флаг для включения/отключения детального логирования

ENABLE_DETAILED_LOG = True

def debug_log(message):

    """Логирует сообщение только если детальное логирование включено"""
    if ENABLE_DETAILED_LOG:
        frappe.log(message)

def _tasks_forecast_impl(fd: frappe._dict | ForecastFormDict) -> TasksForecastResponse | ErrorTasksResponse:

    """Получает все задачи с прогнозом (PWE) и нагрузкой (PWA)"""

    
    project = fd.get('project')
    periods = fd.get('periods')
    view_options = fd.get('view_options', 'Прогноз и факт')

    
    debug_log("=== STEP 1: PARAMETERS ===")
    debug_log(f"Project: {project}")
    debug_log(f"Periods received: {periods is not None}")
    debug_log(f"View options: {view_options}")

    
    if not project:
        return {
            'tasks': [],
            'tasks_details': {},
            'error': 'No project specified'
        }

    
    # ========== 1. ПОЛУЧАЕМ ПЕРИОДЫ ==========
    debug_log("=== STEP 2: GET PERIODS ===")

    
    if not periods or not isinstance(periods, list):
        debug_log("No periods provided, generating from project dates")

        
        Project = frappe.qb.DocType('Project')
        project_data = (
            frappe.qb.from_(Project)
            .select(Project.expected_start_date, Project.expected_end_date)
            .where(Project.name == project)
            .limit(1)
        ).run(as_dict=True)

        
        if not project_data:
            return {
                'tasks': [],
                'tasks_details': {},
                'error': 'Project not found',
            }
        project_data = project_data[0]

        
        if not project_data.get('expected_start_date'):
            return {
                'tasks': [],
                'tasks_details': {},
                'error': 'Project start date not set'
            }

        
        start = frappe.utils.getdate(project_data.get('expected_start_date'))
        end = frappe.utils.getdate(project_data.get('expected_end_date') or frappe.utils.add_months(start, 12))

        
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

        
        debug_log(f"Generated {len(periods)} periods")
    else:
        debug_log(f"Received {len(periods)} periods")

        
    # ========== ФИЛЬТРАЦИЯ ПЕРИОДОВ ПО view_options ==========
    debug_log("=== STEP 2.5: FILTER PERIODS BY view_options ===")

    
    periods_to_check = []
    if view_options == "Только факт":
        # Не проверяем ничего
        periods_to_check = []
    elif view_options == "Только прогноз":
        # Проверяем ВСЕ периоды
        periods_to_check = periods
    else:  # "Прогноз и факт"
        # Проверяем только текущий и будущие периоды
        periods_to_check = [p for p in periods if not p.get('is_past', False)]

    
    debug_log(f"  view_options: {view_options}")
    debug_log(f"  periods before filter: {len(periods)}")
    debug_log(f"  periods after filter: {len(periods_to_check)}")

    
    periods = periods_to_check

    
    if not periods:
        return {
            'tasks': [],
            'tasks_details': {},
            'total_tasks': 0
        }

    
    # ========== 2. ПОЛУЧАЕМ ПРОГНОЗНЫЕ ДАННЫЕ (PWE) ==========
    debug_log("=== STEP 3: GET FORECAST DATA (PWE) ===")

    
    PWE = frappe.qb.DocType('Project Work Efforts')
    PWEA = frappe.qb.DocType('Project Work Efforts Amount')

    
    pwe_query = (
        frappe.qb.from_(PWE)
        .left_join(PWEA)
        .on(PWEA.parent == PWE.name)
        .select(
            PWE.pwe_task.as_('task'),
            PWE.pwe_project_role.as_('role'),
            PWEA.pwea_year.as_('year'),
            PWEA.pwea_month.as_('month'),
            PWEA.pwea_expected.as_('forecast_hours'),
            PWEA.pwea_plan.as_('plan_hours')
        )
        .where(PWE.pwe_project == project)
        .where(PWEA.pwea_expected.isnotnull())
        .where(PWEA.pwea_expected > 0)
    )

    
    pwe_list = pwe_query.run(as_dict=True)
    debug_log(f"Raw PWE records found: {len(pwe_list)}")

    
    forecast_cache = {}
    plan_cache = {}
    for row in pwe_list:
        if row.get('year') and row.get('month'):
            month = int(row.get('month'))
            key = f"{row.get('task')}_{row.get('role')}_{row.get('year')}_{month}"
            forecast_cache[key] = float(row.get('forecast_hours', 0))
            plan_cache[key] = float(row.get('plan_hours', 0))

    
    debug_log(f"Forecast cache size: {len(forecast_cache)}")
    debug_log(f"Plan cache size: {len(plan_cache)}")

    
    # ========== 3. ПОЛУЧАЕМ ВСЕ НАЗНАЧЕНИЯ (PWA) ==========
    debug_log("=== STEP 4: GET ASSIGNMENTS (PWA) ===")

    
    if periods:
        min_date = f"{periods[0]['year']}-{periods[0]['month']:02d}-01"
        max_date = frappe.utils.get_last_day(f"{periods[-1]['year']}-{periods[-1]['month']:02d}-01")
    else:
        min_date = "2000-01-01"
        max_date = "2100-12-31"

    
    debug_log(f"Date range for assignments: {min_date} to {max_date}")

    
    PWA = frappe.qb.DocType('Project Workload Assignment')
    Task = frappe.qb.DocType('Task')

    
    assignments_query = (
        frappe.qb.from_(PWA)
        .inner_join(Task)
        .on(Task.name == PWA.task)
        .select(
            PWA.name,
            PWA.task,
            Task.subject.as_('task_subject'),
            PWA.role,
            PWA.user,
            PWA.workload,
            PWA.wl_value,
            PWA.date_from,
            PWA.date_to,
        )
        .where(Task.project == project)
        .where(PWA.date_from.isnotnull())
        .where(PWA.date_to.isnotnull())
        .where(PWA.date_to >= min_date)
        .where(PWA.date_from <= max_date)
    )

    
    assignments = assignments_query.run(as_dict=True)
    debug_log(f"Assignments found: {len(assignments)}")

    
    if not assignments:
        debug_log("No assignments found")
        return {
            'tasks': [],
            'tasks_details': {}
        }

    
    # ========== 4. КОНТЕКСТ РАСЧЁТА (WorkloadContext) ==========
    debug_log("=== STEP 5: LOAD WORKLOAD CONTEXT ===")

    
    users_list = list({a.get('user') for a in assignments if a.get('user')})
    users_data = load_users_with_worker_context(users_list)
    projects_data = load_projects([project])
    working_hours_overrides = load_working_hours_overrides(users_data)
    holiday_lists_cache, holiday_date_sets = load_holiday_data(users_data, projects_data)
    user_absences = load_user_absences(users_list, min_end_date=getdate(min_date))
    monthly_plan_cache = load_monthly_plan_cache(assignments)
    monthly_plan_cache.update(plan_cache)

    
    period_set = set()
    period_dates = set()
    for p in periods:
        period_set.add((p['year'], p['month']))
        period_start = getdate(f"{p['year']}-{p['month']:02d}-01")
        period_end = frappe.utils.get_last_day(period_start)
        current = period_start
        while current <= period_end:
            period_dates.add(str(current))
            current = frappe.utils.add_days(current, 1)

    
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

    
    # ========== 5. СБОР ВСЕХ ДАННЫХ ПО ЗАДАЧАМ ==========
    debug_log("=== STEP 6: COLLECT TASKS DATA ===")

    
    tasks_map = {}
    tasks_details = {}

    
    debug_log("  Collecting forecasts from PWE...")

    
    for key, forecast_hours in forecast_cache.items():
        parts = key.split('_')
        if len(parts) >= 4:
            task = '_'.join(parts[:-3])
            role = parts[-3]
            year = int(parts[-2])
            month = int(parts[-1])

            
            if (year, month) not in period_set:
                continue

            
            plan_hours = plan_cache.get(key, 0)

            
            if task not in tasks_map:
                tasks_map[task] = {
                    'task': task,
                    'task_subject': task,
                    'total_forecast': 0,
                    'total_assigned': 0
                }
            tasks_map[task]['total_forecast'] = tasks_map[task]['total_forecast'] + forecast_hours

            
            if task not in tasks_details:
                tasks_details[task] = {}
            if role not in tasks_details[task]:
                tasks_details[task][role] = {}
            period_key = f"{year}-{month}"
            tasks_details[task][role][period_key] = {
                'forecast_hours': forecast_hours,
                'plan_hours': plan_hours,
                'users': {}
            }

            
            debug_log(f"    Added forecast for {task}/{role}/{period_key}: +{forecast_hours}, plan={plan_hours}")

    
    task_subjects = {}
    for a in assignments:
        if a.get('task') and a.get('task_subject'):
            task_subjects[a['task']] = a['task_subject']

    
    for task_id, task_data in tasks_map.items():
        if task_data['task_subject'] == task_id and task_id in task_subjects:
            task_data['task_subject'] = task_subjects[task_id]

    
    debug_log("  Collecting workload from PWA via WorkloadContext...")
    checked_counter = 0

    
    for assignment in assignments:
        checked_counter += 1
        task = assignment.get('task')
        role = assignment.get('role') or ''
        user_email = assignment.get('user')
        workload_type = assignment.get('workload')
        percentage = float(assignment.get('wl_value') or 0)

        
        engine_input = {
            'task': task,
            'role': role,
            'user': user_email,
            'date_from': assignment.get('date_from'),
            'date_to': assignment.get('date_to'),
            'workload': workload_type,
            'wl_value': assignment.get('wl_value'),
            'project_name': project,
            'project': project,
        }

        
        daily_loads = wl_ctx.compute_assignment_daily_hours(engine_input)
        for date_str, hours in daily_loads.items():
            if hours <= 0:
                continue
            d = getdate(date_str)
            if (d.year, d.month) not in period_set:
                continue

            
            period_key = f"{d.year}-{d.month}"
            forecast_key = f"{task}_{role}_{d.year}_{d.month}"
            forecast_hours = forecast_cache.get(forecast_key, 0)
            plan_hours = plan_cache.get(forecast_key, 0) or monthly_plan_cache.get(forecast_key, 0)

            
            if task not in tasks_map:
                tasks_map[task] = {
                    'task': task,
                    'task_subject': task_subjects.get(task, task),
                    'total_forecast': 0,
                    'total_assigned': 0
                }

            
            if task not in tasks_details:
                tasks_details[task] = {}
            if role not in tasks_details[task]:
                tasks_details[task][role] = {}
            if period_key not in tasks_details[task][role]:
                tasks_details[task][role][period_key] = {
                    'forecast_hours': forecast_hours,
                    'plan_hours': plan_hours,
                    'users': {}
                }

            
            tasks_map[task]['total_assigned'] = tasks_map[task]['total_assigned'] + hours

            
            if user_email not in tasks_details[task][role][period_key]['users']:
                tasks_details[task][role][period_key]['users'][user_email] = {
                    'assigned_hours': 0,
                    'workload_type': workload_type,
                    'percentage': percentage
                }

            
            user_detail = tasks_details[task][role][period_key]['users'][user_email]
            user_detail['assigned_hours'] = user_detail['assigned_hours'] + hours

    
    # ========== 6. ФОРМИРУЕМ ОТВЕТ ==========
    debug_log("=== STEP 7: RESULTS ===")
    debug_log(f"Total assignments calculations: {checked_counter}")
    debug_log(f"Total tasks with data: {len(tasks_map)}")

    
    tasks_aggregated = []
    for task_id, task_data in tasks_map.items():
        tasks_aggregated.append({
            'task': task_data['task'],
            'task_subject': task_data['task_subject'],
            'total_forecast': round(task_data['total_forecast'], 2),
            'total_assigned': round(task_data['total_assigned'], 2)
        })

    
    frappe.log(f"Tasks with forecast/workload: {len(tasks_aggregated)}")

    
    return {
        'tasks': tasks_aggregated,
        'tasks_details': tasks_details,
        'total_tasks': len(tasks_aggregated)
    }
