# flat_workload_report.py
import frappe
from frappe import _
from frappe.utils import getdate, add_days, nowdate


def execute(filters=None):
    """
    Плоский отчет: Пользователь | Роль | Проект | Задача | Дата | Часы | FTE
    """
    
    filters = filters or {}
    
    columns = [
        {
            "fieldname": "user_name",
            "label": _("Пользователь"),
            "fieldtype": "Data",
            "width": 200
        },
        {
            "fieldname": "role",
            "label": _("Роль"),
            "fieldtype": "Data",
            "width": 150
        },
        {
            "fieldname": "project_name",
            "label": _("Проект"),
            "fieldtype": "Data",
            "width": 200
        },
        {
            "fieldname": "task",
            "label": _("Задача"),
            "fieldtype": "Data",
            "width": 200
        },
        {
            "fieldname": "date",
            "label": _("Дата"),
            "fieldtype": "Date",
            "width": 100
        },
        {
            "fieldname": "hours",
            "label": _("Часы"),
            "fieldtype": "Float",
            "precision": 2,
            "width": 100
        },
        {
            "fieldname": "fte",
            "label": _("FTE"),
            "fieldtype": "Float",
            "precision": 4,
            "width": 80
        }
    ]
    
    data = get_data(filters)
    
    return columns, data


def get_data(filters):
    user_filter = filters.get('user')
    project_filter = filters.get('project')
    task_filter = filters.get('task')
    user_group_filter = filters.get('user_group')
    from_date = filters.get('from_date') or nowdate()
    to_date = filters.get('to_date') or add_days(nowdate(), 90)
    
    # 1. Получаем все назначения
    PWA = frappe.qb.DocType("Project Workload Assignment")
    Task = frappe.qb.DocType("Task")
    
    q = (
        frappe.qb.from_(PWA)
        .inner_join(Task)
        .on(PWA.task == Task.name)
        .select(
            PWA.name,
            PWA.user,
            PWA.task,
            PWA.role,
            PWA.date_from,
            PWA.date_to,
            PWA.workload,
            PWA.wl_value,
            Task.project.as_("project"),
            Task.subject.as_("task_subject")
        )
        .where(PWA.user.isnotnull())
        .where(PWA.task.isnotnull())
        .where(Task.project.isnotnull())
        .where(PWA.date_from.isnotnull())
        .where(PWA.date_to >= from_date)
        .where(PWA.date_from <= to_date)
    )
    
    if user_filter:
        q = q.where(PWA.user == user_filter)
    if project_filter:
        q = q.where(Task.project == project_filter)
    if task_filter:
        q = q.where(PWA.task == task_filter)
    if user_group_filter:
        UGM = frappe.qb.DocType("User Group Member")
        q = q.inner_join(UGM).on(
            (UGM.parent == user_group_filter) & 
            (UGM.user == PWA.user)
        )
    
    assignments = q.run(as_dict=True)
    
    if not assignments:
        return []
    
    # 2. Собираем уникальные сущности
    users_set = list(set(a['user'] for a in assignments))
    projects_set = list(set(a['project'] for a in assignments))
    tasks_set = list(set(a['task'] for a in assignments))
    roles_set = list(set(a['role'] for a in assignments if a.get('role')))
    
    # 3. Загружаем данные пользователей
    User = frappe.qb.DocType("User")
    Worker = frappe.qb.DocType("Worker")
    TS = frappe.qb.DocType("Timesheet Template")
    
    users_data = {}
    if users_set:
        users_db = (
            frappe.qb.from_(User)
            .left_join(Worker).on(User.name == Worker.wuser)
            .left_join(TS).on(Worker.wtimesheet_template == TS.name)
            .select(
                User.name,
                User.full_name,
                Worker.wholiday_list,
                TS.hours_on_date,
                TS.tt_working_hours_on_date
            )
            .where(User.name.isin(users_set))
        ).run(as_dict=True)
        
        for u in users_db:
            users_data[u['name']] = u
    
    # 4. Загружаем данные проектов
    projects_data = {}
    if projects_set:
        projects_db = frappe.qb.get_query(
            "Project",
            fields=["name", "project_name", "holiday_list"],
            filters=[["name", "in", projects_set]]
        ).run(as_dict=True)
        
        for p in projects_db:
            projects_data[p['name']] = p
    
    # 5. Загружаем данные задач
    tasks_data = {}
    if tasks_set:
        tasks_db = frappe.qb.get_query(
            "Task",
            fields=["name", "subject"],
            filters=[["name", "in", tasks_set]]
        ).run(as_dict=True)
        
        for t in tasks_db:
            tasks_data[t['name']] = t
    
    # 6. Загружаем переопределения рабочих часов
    working_hours_overrides = {}
    for user_data in users_data.values():
        wh_ref = user_data.get('tt_working_hours_on_date')
        if wh_ref and wh_ref not in working_hours_overrides:
            overrides = frappe.qb.get_query(
                "Working Hours Table",
                fields=["parent as ref_name", "wht_date", "wht_hours"],
                filters=[
                    ["parent", "=", wh_ref],
                    ["parentfield", "=", "hod_working_hours_table"],
                    ["parenttype", "=", "Working Hours On Date"]
                ]
            ).run(as_dict=True)
            
            override_dict = {}
            for row in overrides:
                if row.wht_date:
                    override_dict[str(row.wht_date)] = float(row.wht_hours or 0)
            working_hours_overrides[wh_ref] = override_dict
    
    # 7. Загружаем праздники
    all_holiday_lists = set()
    for p in projects_data.values():
        if p.get('holiday_list'):
            all_holiday_lists.add(p['holiday_list'])
    for u in users_data.values():
        if u.get('wholiday_list'):
            all_holiday_lists.add(u['wholiday_list'])
    
    holiday_date_sets = {}
    if all_holiday_lists:
        holidays = frappe.qb.get_query(
            "Holiday",
            fields=["parent as list_name", "holiday_date"],
            filters=[
                ["parent", "in", list(all_holiday_lists)],
                ["parentfield", "=", "holidays"],
                ["parenttype", "=", "Holiday List"]
            ]
        ).run(as_dict=True)
        
        for row in holidays:
            list_name = row.list_name
            if list_name not in holiday_date_sets:
                holiday_date_sets[list_name] = set()
            holiday_date_sets[list_name].add(str(row.holiday_date))
    
    # 8. Загружаем отсутствия
    user_absences = {}
    if users_set:
        absences = frappe.qb.get_query(
            "Application For Leave",
            fields=[
                "lauser", "alfrom_date", "alto_date",
                "alfrom_hours", "alto_hours"
            ],
            filters=[
                ["lauser", "in", users_set],
                ["status", "=", "Согласовано"],
                ["alfrom_date", "is", "set"],
                ["alto_date", "is", "set"],
                ["alto_date", ">=", from_date]
            ]
        ).run(as_dict=True)
        
        for absence in absences:
            email = absence.lauser
            if email not in user_absences:
                user_absences[email] = []
            user_absences[email].append({
                'from_date': getdate(absence.alfrom_date),
                'to_date': getdate(absence.alto_date),
                'alfrom_hours': float(absence.alfrom_hours or 0),
                'alto_hours': float(absence.alto_hours or 0)
            })
    
    # 9. Загружаем плановые часы
    monthly_plan_cache = {}
    if tasks_set and roles_set:
        PWE = frappe.qb.DocType("Project Work Efforts")
        PWEA = frappe.qb.DocType("Project Work Efforts Amount")
        
        plans = (
            frappe.qb.from_(PWE)
            .inner_join(PWEA).on(PWEA.parent == PWE.name)
            .select(
                PWE.pwe_task.as_("task"),
                PWE.pwe_project_role.as_("role"),
                PWEA.pwea_year.as_("year"),
                PWEA.pwea_month.as_("month"),
                PWEA.pwea_plan.as_("plan_hours")
            )
            .where(PWE.pwe_task.isin(tasks_set))
            .where(PWE.pwe_project_role.isin(roles_set))
            .where(PWEA.pwea_plan > 0)
        ).run(as_dict=True)
        
        for plan in plans:
            key = plan['task'] + '_' + plan['role'] + '_' + str(plan['year']) + '_' + str(plan['month'])
            monthly_plan_cache[key] = float(plan['plan_hours'] or 0)
    
    # 10. Вспомогательные функции
    def get_working_hours(user_email, date_str):
        user_data = users_data.get(user_email, {})
        base_hours = float(user_data.get('hours_on_date') or 8.0)
        
        wh_ref = user_data.get('tt_working_hours_on_date')
        if wh_ref and wh_ref in working_hours_overrides:
            override_dict = working_hours_overrides[wh_ref]
            if date_str in override_dict:
                return float(override_dict[date_str])
        
        return base_hours
    
    def is_working_day(date_str, user_email, project_name):
        project_data = projects_data.get(project_name, {})
        project_holiday = project_data.get('holiday_list')
        if project_holiday and project_holiday in holiday_date_sets:
            if date_str in holiday_date_sets[project_holiday]:
                return False
        
        user_data = users_data.get(user_email, {})
        user_holiday = user_data.get('wholiday_list')
        if user_holiday and user_holiday in holiday_date_sets:
            if date_str in holiday_date_sets[user_holiday]:
                return False
        
        if user_email in user_absences:
            target_date = getdate(date_str)
            user_hours = get_working_hours(user_email, date_str)
            
            for absence in user_absences[user_email]:
                if absence['from_date'] <= target_date <= absence['to_date']:
                    if target_date == absence['from_date']:
                        absence_hours = absence['alfrom_hours']
                    elif target_date == absence['to_date']:
                        absence_hours = absence['alto_hours']
                    else:
                        absence_hours = user_hours
                    
                    if absence_hours >= user_hours:
                        return False
        
        return True
    
    def get_absence_hours(date_str, user_email):
        if user_email not in user_absences:
            return 0.0
        
        target_date = getdate(date_str)
        user_hours = get_working_hours(user_email, date_str)
        
        for absence in user_absences[user_email]:
            if absence['from_date'] <= target_date <= absence['to_date']:
                if target_date == absence['from_date']:
                    return absence['alfrom_hours']
                elif target_date == absence['to_date']:
                    return absence['alto_hours']
                else:
                    return user_hours
        
        return 0.0
    
    # 11. Расчет нагрузки
    result = []
    working_day_cache = {}
    user_hours_cache = {}
    
    from_date_obj = getdate(from_date)
    to_date_obj = getdate(to_date)
    
    for assignment in assignments:
        user_email = assignment['user']
        project_name = assignment['project']
        task_name = assignment['task']
        role_name = assignment.get('role', '')
        date_from = getdate(assignment['date_from'])
        date_to = getdate(assignment['date_to'])
        workload_type = assignment.get('workload')
        
        if date_from < from_date_obj:
            date_from = from_date_obj
        if date_to > to_date_obj:
            date_to = to_date_obj
        
        user_data = users_data.get(user_email, {})
        project_data = projects_data.get(project_name, {})
        task_data = tasks_data.get(task_name, {})
        
        user_display_name = user_data.get('full_name', user_email)
        project_display_name = project_data.get('project_name', project_name)
        task_display_name = task_data.get('subject', task_name)
        
        if workload_type == 'В рабочих часах':
            total_assignment_hours = float(assignment['wl_value'] or 0)
            total_available = 0.0
            date_available_hours = {}
            
            current_date = date_from
            while current_date <= date_to:
                date_str = str(current_date)
                cache_key = date_str + '_' + user_email + '_' + project_name
                
                if cache_key not in working_day_cache:
                    working_day_cache[cache_key] = is_working_day(date_str, user_email, project_name)
                
                if working_day_cache[cache_key]:
                    hours_cache_key = user_email + '_' + date_str
                    if hours_cache_key not in user_hours_cache:
                        base_hours = get_working_hours(user_email, date_str)
                        absence_hours = get_absence_hours(date_str, user_email)
                        available = base_hours - absence_hours
                        if available < 0:
                            available = 0.0
                        user_hours_cache[hours_cache_key] = available
                    
                    available_hours = user_hours_cache[hours_cache_key]
                    total_available = total_available + available_hours
                    date_available_hours[date_str] = available_hours
                
                current_date = add_days(current_date, 1)
            
            if total_available > 0:
                for date_str in date_available_hours:
                    available = date_available_hours[date_str]
                    daily_ratio = available / total_available
                    daily_hours = total_assignment_hours * daily_ratio
                    fte = daily_hours / 8.0
                    
                    result.append({
                        'user_name': user_display_name,
                        'role': role_name,
                        'project_name': project_display_name,
                        'task': task_display_name,
                        'date': date_str,
                        'hours': round(daily_hours, 2),
                        'fte': round(fte, 4)
                    })
        
        elif workload_type == 'В % от фонда рабочих часов':
            percentage = float(assignment['wl_value'] or 0) / 100.0
            
            current_date = date_from
            while current_date <= date_to:
                date_str = str(current_date)
                cache_key = date_str + '_' + user_email + '_' + project_name
                
                if cache_key not in working_day_cache:
                    working_day_cache[cache_key] = is_working_day(date_str, user_email, project_name)
                
                if working_day_cache[cache_key]:
                    hours_cache_key = user_email + '_' + date_str
                    if hours_cache_key not in user_hours_cache:
                        base_hours = get_working_hours(user_email, date_str)
                        absence_hours = get_absence_hours(date_str, user_email)
                        available = base_hours - absence_hours
                        if available < 0:
                            available = 0.0
                        user_hours_cache[hours_cache_key] = available
                    
                    available_hours = user_hours_cache[hours_cache_key]
                    daily_hours = percentage * available_hours
                    fte = daily_hours / 8.0
                    
                    result.append({
                        'user_name': user_display_name,
                        'role': role_name,
                        'project_name': project_display_name,
                        'task': task_display_name,
                        'date': date_str,
                        'hours': round(daily_hours, 2),
                        'fte': round(fte, 4)
                    })
                
                current_date = add_days(current_date, 1)
        
        elif workload_type == 'В % от трудоемкости задачи':
            percentage = float(assignment['wl_value'] or 0) / 100.0
            task = assignment['task']
            role = assignment.get('role')
            
            if not role:
                continue
            
            months_data = {}
            current_date = date_from
            while current_date <= date_to:
                date_str = str(current_date)
                year = current_date.year
                month = current_date.month
                month_key = str(year) + '_' + str(month)
                
                if month_key not in months_data:
                    months_data[month_key] = {
                        'working_days': 0,
                        'dates': []
                    }
                
                months_data[month_key]['dates'].append(date_str)
                
                cache_key = date_str + '_' + user_email + '_' + project_name
                if cache_key not in working_day_cache:
                    working_day_cache[cache_key] = is_working_day(date_str, user_email, project_name)
                
                if working_day_cache[cache_key]:
                    months_data[month_key]['working_days'] = months_data[month_key]['working_days'] + 1
                
                current_date = add_days(current_date, 1)
            
            for month_key in months_data:
                month_info = months_data[month_key]
                parts = month_key.split('_')
                year = parts[0]
                month = parts[1]
                
                plan_key = task + '_' + role + '_' + year + '_' + month
                
                if plan_key in monthly_plan_cache:
                    monthly_plan_hours = monthly_plan_cache[plan_key]
                    
                    if monthly_plan_hours > 0 and month_info['working_days'] > 0:
                        daily_plan_hours = monthly_plan_hours / month_info['working_days']
                        
                        for date_str in month_info['dates']:
                            cache_key = date_str + '_' + user_email + '_' + project_name
                            if cache_key in working_day_cache and working_day_cache[cache_key]:
                                daily_hours = percentage * daily_plan_hours
                                fte = daily_hours / 8.0
                                
                                result.append({
                                    'user_name': user_display_name,
                                    'role': role_name,
                                    'project_name': project_display_name,
                                    'task': task_display_name,
                                    'date': date_str,
                                    'hours': round(daily_hours, 2),
                                    'fte': round(fte, 4)
                                })
    
    result.sort(key=lambda x: (x['date'], x['user_name'], x['project_name'], x['task']))
    
    return result