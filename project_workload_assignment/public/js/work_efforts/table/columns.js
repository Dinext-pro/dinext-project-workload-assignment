// we-table/columns.js — get_columns_definition + role add/delete handlers
// ISS-2025-01239

/**
 * Определение колонок StickyDataTable для Work Efforts.
 * @param {WorkEffortsForm} frm
 * @param {string} periodType
 * @param {string} unit
 * @returns {object[]}
 */
function get_columns_definition(frm, periodType, unit) {
    let columns = [];
    let allRoles = project_workload_assignment.work_efforts.get_project_roles(frm);

    // 1. Колонка "Задачи"
    columns.push({
        name: __("Задачи"),
        id: "subject",
        width: 250,
        sortable: false,
        dropdown: false,
        editable: false,
        focusable: false,
        treeView: true,
        format: (value, row, column, data) => {
            let taskId = data?.value;
            let missingRoles = frm._missingPlanMap?.[taskId];

            // Оборачиваем в div с data-task-id для поиска при expandParents
            let html = `<div data-task-id="${taskId}"`;

            if (missingRoles && missingRoles.length > 0) {
                let rolesList = missingRoles.join(", ");
                let tooltipText = __("Не определены трудозатраты для ролей: {0}", [rolesList]);
                html += `class="missing-plan-task" data-tooltip="${tooltipText}"`;
            }

            html += '>';
            html += data?.subject || value;
            html += `</div>`;
            return html;
        }
    });

    // 2. Колонка "Роли"
    columns.push({
        name: "Роли",
        id: "role",
        width: 220,
        sortable: false,
        editable: false,
        focusable: false,
        dropdown: false,
        format: (value, row, column, data) => {
            let roleLines = "";

            if (data) {
                let taskId = data.value;
                let missingRoles = frm._missingPlanMap?.[taskId] || [];

                let role_data = data.role_data || [];
                role_data = role_data.sort((a, b) => (a.role.localeCompare(b.role)));

                role_data.forEach(r => {
                    let isMissing = missingRoles.includes(r.role);
                    let tooltipAttr = isMissing
                        ? ` data-tooltip="${__("Не определены трудозатраты для роли: {0}", [r.role])}"`
                        : '';

                    roleLines += `<div class='we-role ${isMissing ? "miss-plan" : ""}' ${tooltipAttr}>`;
                    roleLines += r.role ? __(r.role) : "-";

                    // Delete Button
                    let hasFact = false;
                    for (const key in r) {
                        if (key.startsWith("fact_") && parseFloat(r[key]) > 0) {
                            hasFact = true;
                            break;
                        }
                    }
                    if (r.role && !hasFact) {
                        roleLines += `<button data-task="${data.value}" data-role="${r.role}"
                            class="btn delete-role-btn btn-default btn-sm filter-x-button" title="Удалить роль">
                            <span class="filter-icon">
                                <svg class="es-icon es-line icon-sm" aria-hidden="true">
                                    <use class="" href="#es-small-close"></use>
                                </svg>
                            </span>
                        </button>`;
                    }

                    roleLines += `</div>`;
                });

                // Добавление выпадающего списка с новыми ролями
                let existingRoles = role_data.map(r => r.role);
                let availableRoles = allRoles.filter(r => r && !existingRoles.includes(r));
                if (availableRoles.length > 0) {
                    roleLines += `<div>
                        <select class="new-role-select btn btn-default" data-task="${data.value}">
                            <option value="">${__("Добавить роль")}</option>`;
                    availableRoles.forEach(role => {
                        roleLines += `<option value="${role}">${__(role)}</option>`;
                    });
                    roleLines += `</select>
                        </div>`;
                }
            } else if (value) {
                roleLines = value;
            }

            return roleLines;
        }
    });

    // 3. Колонка "Назначения"
    if (frm.show_assignments) {
        columns.push({
            name: __("Назначения"),
            id: "assignments",
            width: 95,
            sortable: false,
            editable: false,
            focusable: false,
            dropdown: false,
            format: function(value, row, column, data) {
                if (!data || !data.value) return "";

                let task_id = data.value;
                let role_data = data.role_data || [];

                // Получаем назначения из кэша
                let assignments = project_workload_assignment.work_efforts.get_task_assignments(task_id);

                function normalize(str) {
                    return str ? str.trim() : "";
                }

                let rolesWithAssignments = {};
                assignments.forEach(assignment => {
                    let role = normalize(assignment.role) || "Без роли";
                    if (!rolesWithAssignments[role]) {
                        rolesWithAssignments[role] = [];
                    }
                    rolesWithAssignments[role].push(assignment);
                });

                function getAvatarGroupHtml(users, limit = 3) {
                    if (!users || users.length === 0) return '';
                    try {
                        let userEmails = users.map(u => u.user);
                        let avatarGroup = frappe.avatar_group(userEmails, limit, { filterable: false });
                        if (avatarGroup && avatarGroup.length > 0) {
                            return avatarGroup[0].outerHTML;
                        }
                    } catch (e) {
                        console.error("Ошибка в avatar_group:", e);
                    }
                    return '';
                }

                let html = '<div class="assignments-container">';

                role_data.forEach((r, idx) => {
                    let role = normalize(r.role);
                    let users = [];

                    if (role && rolesWithAssignments[role]) {
                        users = rolesWithAssignments[role];
                        delete rolesWithAssignments[role];
                    }

                    let avatarHtml = getAvatarGroupHtml(users, 3);

                    html += `<div class="assignment-row" data-task="${task_id}">`;
                    if (avatarHtml) {
                        html += `<div class="assignment-avatars-group">${avatarHtml}</div>`;
                    }
                    html += `</div>`;
                });

                let remainingRoles = Object.keys(rolesWithAssignments);
                if (remainingRoles.length > 0) {
                    let allUsers = [];
                    remainingRoles.forEach(role => {
                        allUsers.push(...rolesWithAssignments[role]);
                    });
                    let avatarHtml = getAvatarGroupHtml(allUsers, 3);

                    html += `<div class="assignment-row" data-task="${task_id}">`;
                    if (avatarHtml) {
                        html += `<div class="assignment-avatars-group">${avatarHtml}</div>`;
                    }
                    html += `</div>`;
                }

                // Если нет ни одной строки, добавляем пустую для кликабельности
                if (role_data.length === 0 && remainingRoles.length === 0) {
                    html += `<div class="assignment-row" data-task="${task_id}"></div>`;
                }

                html += '</div>';
                return html;
            }
        });
    }

    /*
     * Вместо вложенных columns формируем одну колонку, внутри которой вручную выводим три значения.
     * Для редактирования (если период текущий или будущий) делаем значение "факт/прогноз" кликабельным.
     */
    let periods = project_workload_assignment.work_efforts.get_display_periods(frm, periodType);
    periods.forEach(function(period) {
        // Если период в прошлом – отображаем "факт", иначе "прогноз"
        let subcolumn_label = period.is_past ? __("Факт") : __("Прогноз");

        columns.push({
            name: `<div style="text-align:center;">
                    ${period.year} ${period.month}<br/>
                    <div class="work-efforts-group-header">` +
                        (cur_frm.hide_plan ? "" : `<span>План</span>`) +
                        `<span>${subcolumn_label}</span>` +
                        (cur_frm.hide_delta ? "" : `<span>Δ</span>`) +
                    `</div>
               </div>`,
            id: `group_${period.year}_${period.month}`,
            sortable: false,
            get width() {
                return 200 - (cur_frm.hide_plan ? 65 : 0) - (cur_frm.hide_delta ? 65 : 0);
            },
            dropdown: false,
            focusable: false,
            editable: false,
            format: function(value, row, column, data) {
                let lines = "";

                if (data) {
                    let taskId = data.value;
                    let role_data = data.role_data || [];
                    role_data = role_data.sort((a, b) => (a.role.localeCompare(b.role)));

                    // Получаем информацию о проблемных периодах
                    let taskPeriodsMap = frm._missingPlanPeriodsMap?.[taskId] || {};

                    // Проверяем сроки для плана
                    let inPlanDates = project_workload_assignment.work_efforts.isPeriodInTaskDates(period, data.custom_planned_start_date, data.custom_planned_end_date);

                    // Вычисляем даты для факта (с fallback на прогнозные)
                    let factStartDate = data.act_start_date || data.exp_start_date;
                    let factEndDate = data.act_end_date || data.exp_end_date;
                    let inFactDates = project_workload_assignment.work_efforts.isPeriodInTaskDates(period, factStartDate, factEndDate);

                    // Вычисляем даты для прогноза
                    let inForecastDates = project_workload_assignment.work_efforts.isPeriodInTaskDates(period, data.exp_start_date, data.exp_end_date);

                    // Проверяем конфликт: факт в прошлом + прогноз в будущем
                    let today = new Date();
                    let actStart = data.act_start_date ? new Date(data.act_start_date) : null;
                    let actEnd = data.act_end_date ? new Date(data.act_end_date) : null;
                    let expStart = data.exp_start_date ? new Date(data.exp_start_date) : null;

                    let hasFactInPast = (actStart && actEnd && actEnd < today);
                    let hasForecastInFuture = (expStart && expStart >= today);
                    let factAndForecastConflict = hasFactInPast && hasForecastInFuture;

                    // Результирующая заливка
                    let showForecastFill = false;

                    if (frm.view_options === __("Только прогноз")) {
                        showForecastFill = inForecastDates;
                    } else if (frm.view_options === __("Только факт")) {
                        showForecastFill = inFactDates;
                    } else { // "Прогноз и факт"
                        if (factAndForecastConflict) {
                            showForecastFill = inFactDates;
                        } else {
                            if (period.is_past) {
                                showForecastFill = inFactDates;
                            } else {
                                showForecastFill = inForecastDates;
                            }
                        }
                    }

                    // Классы для колонок
                    let planColumnClass = "we-plan-column";
                    if (inPlanDates) planColumnClass += " in-plan-dates";

                    let actualColumnClass = "we-actual-column";
                    if (inForecastDates) actualColumnClass += " in-forecast-dates";

                    let deltaColumnClass = "we-delta-column";
                    if (inForecastDates) deltaColumnClass += " in-forecast-dates";

                    // Доступные роли (вычисляем один раз)
                    let existingRoles = role_data.map(r => r.role);
                    let availableRoles = allRoles.filter(r => r && !existingRoles.includes(r));

                    // Начинаем контейнер
                    lines += `<div class="we-columns-container" data-year="${period.year}" data-month="${period.month}" data-task="${data.value}">`;

                    // ========== КОЛОНКА ПЛАНА ==========
                    if (!cur_frm.hide_plan) {
                        lines += `<div class="${planColumnClass}">`;

                        role_data.forEach(function(r) {
                            let roleName = r.role || '';
                            let plan = r[`plan_${period.year}_${period.month}`] || 0;

                            let planClasses = "we-role-value";
                            if (plan == 0) planClasses += " zero";

                            let rolePeriods = taskPeriodsMap[roleName];
                            let isMissingPeriod = rolePeriods
                                ? rolePeriods.some(p => p.year == period.year && p.month == period.month)
                                : false;
                            if (isMissingPeriod) planClasses += " missing-plan-highlight";

                            lines += `<div class="${planClasses}" data-role="${roleName}"><span>${plan}</span></div>`;
                        });

                        if (availableRoles.length > 0) {
                            lines += `<div class="we-role-value" data-role=""><span></span></div>`;
                        }

                        lines += `</div>`; // конец колонки плана
                    }

                    // ========== КОЛОНКА ПРОГНОЗА/ФАКТА ==========
                    lines += `<div class="${actualColumnClass}">`;

                    role_data.forEach(function(r) {
                        let roleName = r.role || '';
                        let actual = period.is_past
                            ? (r[`fact_${period.year}_${period.month}`] || 0)
                            : (r[`forecast_${period.year}_${period.month}`] || 0);

                        let actualClasses = "we-role-value";
                        if (actual == 0) actualClasses += " zero";

                        let hasWorkload = project_workload_assignment.work_efforts.hasWorkloadInPeriod(frm, taskId, roleName, period);
                        if (hasWorkload) actualClasses += " has-workload";

                        // Статус лимита — только для фактических колонок
                        if (period.is_past) {
                            let limitKey = `${taskId}_${roleName}_${period.year}_${period.month}`;
                            let limitData = frm.periodLimitStatuses?.[limitKey];
                            if (limitData && limitData.status) {
                                actualClasses += ` limit-${limitData.status}`;
                            }
                        }

                        lines += `<div class="${actualClasses}" data-role="${roleName}">
                            <span class="${period.is_past ? "readonly-fact" : "editable-forecast"}">${actual}</span>
                        </div>`;
                    });

                    if (availableRoles.length > 0) {
                        lines += `<div class="we-role-value" data-role=""></div>`;
                    }

                    lines += `</div>`; // конец колонки прогноза

                    // ========== КОЛОНКА ДЕЛЬТЫ ==========
                    if (!cur_frm.hide_delta) {
                        lines += `<div class="${deltaColumnClass}">`;

                        role_data.forEach(function(r) {
                            let plan = r[`plan_${period.year}_${period.month}`] || 0;
                            let actual = period.is_past
                                ? (r[`fact_${period.year}_${period.month}`] || 0)
                                : (r[`forecast_${period.year}_${period.month}`] || 0);
                            let delta = plan ? (((actual - plan) / plan) * 100).toFixed(1) : 0;

                            let deltaClasses = "we-role-value";
                            if (delta == 0) deltaClasses += " zero";

                            lines += `<div class="${deltaClasses}" data-role="${r.role || ''}"><span>${delta}%</span></div>`;
                        });

                        if (availableRoles.length > 0) {
                            lines += `<div class="we-role-value" data-role=""><span></span></div>`;
                        }

                        lines += `</div>`;
                    }

                    lines += `</div>`; // конец we-columns-container

                } else if (value) {
                    lines = value;
                }

                return lines;
            }
        });
    });

    // Добавляем колонку "Итого" – суммарные значения по всем периодам
    columns.push({
        name: `<div style="text-align:center;">
                    ${__("Итого")}<br/>
                    <div class="work-efforts-group-header">` +
                        (cur_frm.hide_plan ? "" : `<span>План</span>`) +
                        `<span>${__("Прогноз")}</span>` +
                        (cur_frm.hide_delta ? "" : `<span>Δ</span>`) +
                    `</div>
               </div>`,
        id: "total",
        get width() {
            return 200 - (cur_frm.hide_plan ? 65 : 0) - (cur_frm.hide_delta ? 65 : 0);
        },
        sortable: false,
        dropdown: false,
        focusable: false,
        editable: false,
        format: function(value, row, column, data) {
            let lines = "";

            if (data) {
                let role_data = data.role_data || [];
                if (role_data.length === 0) {
                    role_data = [{ role: '' }]; // Пустая роль для отображения фона
                }

                role_data.forEach(function(r) {
                    let total_plan = 0, total_forecast = 0;

                    periods.forEach(function(period) {
                        let p = parseFloat(r[`plan_${period.year}_${period.month}`]) || 0;
                        total_plan += p;
                        if (period.is_past) {
                            let f = parseFloat(r[`fact_${period.year}_${period.month}`]) || 0;
                            total_forecast += f;
                        } else {
                            let f = parseFloat(r[`forecast_${period.year}_${period.month}`]) || 0;
                            total_forecast += f;
                        }
                    });

                    let delta = total_plan
                        ? (((total_forecast - total_plan) / total_plan) * 100).toFixed(1)
                        : 0;

                    lines += `<div class="work-efforts-group"
                            data-task="${data.value}"
                            data-role="${r.role || ''}">
                            ${cur_frm.hide_plan ? "" : `<div class="we-group-plan"><span>${total_plan.toFixed(1)}</span></div>`}
                            <div class="we-group-actual"><span class="readonly-fact">${total_forecast.toFixed(1)}</span></div>
                            ${cur_frm.hide_delta ? "" : `<div class="we-group-delta"><span>${Number.parseFloat(delta).toFixed(1)}%</span></div>`}
                          </div>`;
                });
            } else if (value) {
                lines = value;
            }

            return lines;
        }
    });

    return columns;
}

Object.assign(project_workload_assignment.work_efforts, { get_columns_definition });

// Обработчик выбора новой роли из выпадающего списка
$(document).on('change', '.new-role-select', function(e) {
    let newRole = $(this).val();
    if (!newRole) return;

    let task = $(this).data('task');

    let aggregatedTasks = cur_frm.aggregatedTasks || {};

    let taskData = null;
    if (Array.isArray(aggregatedTasks)) {
        taskData = aggregatedTasks.find(t => t && t.value === task);
    } else {
        taskData = aggregatedTasks[task];
    }

    if (taskData) {
        let role_data = taskData.role_data || [];
        let exists = role_data.some(r => r && r.role === newRole);

        if (!exists) {
            frappe.db.get_list("Project Work Efforts", {
                filters: {
                    pwe_project: cur_frm.doc.name,
                    pwe_task: task,
                    pwe_project_role: newRole
                },
                fields: ["name"],
                limit: 1
            }).then(result => {
                if (result && result.length > 0) {
                    return Promise.resolve(result[0]);
                } else {
                    let new_doc = {
                        doctype: "Project Work Efforts",
                        pwe_project: cur_frm.doc.name,
                        pwe_task: task,
                        pwe_project_role: newRole
                    };
                    return frappe.db.insert(new_doc);
                }
            }).then(() => {
                if (!taskData.role_data) {
                    taskData.role_data = [];
                }
                taskData.role_data.push({ role: newRole });

                // Очистка кэша назначений
                project_workload_assignment.work_efforts.clear_assignments_cache();

                if (cur_frm._tasksByParent) {
                    cur_frm._tasksByParent = null;
                }
                project_workload_assignment.work_efforts.clearTaskIndexCacheFor(cur_frm.aggregatedTasks);

                project_workload_assignment.work_efforts.buildWorkloadPeriodsMap(cur_frm).then(() => {
                    if (cur_frm.show_assignments) {
                        project_workload_assignment.work_efforts.load_all_assignments_if_needed(cur_frm).then(() => {
                            project_workload_assignment.work_efforts.updateTable(cur_frm, "month", "hours");
                        });
                    } else {
                        project_workload_assignment.work_efforts.updateTable(cur_frm, "month", "hours");
                    }
                });

                frappe.show_alert({
                    message: __('Роль {0} добавлена', [newRole]),
                    indicator: 'green'
                }, 3);
            }).catch(err => {
                console.error("Ошибка при создании Project Work Efforts:", err);
                frappe.msgprint(__("Ошибка при добавлении роли"));
            });
        } else {
            project_workload_assignment.work_efforts.updateTable(cur_frm, "month", "hours");
        }
    }
});

// Обработчик удаления роли
$(document).on('click', '.delete-role-btn', function(e) {
    e.stopPropagation();
    let btn = $(this);
    let task = btn.data("task");
    let role = btn.data("role");

    frappe.confirm(
        __("Вы действительно хотите удалить роль {0} для задачи {1}?", [role, task]),
        () => {
            frappe.db.get_list("Project Work Efforts", {
                filters: {
                    pwe_project: cur_frm.doc.name,
                    pwe_task: task,
                    pwe_project_role: role
                },
                fields: ["name", "pwe_project_role"],
                limit: 10
            }).then(result => {
                if (result && result.length > 0) {
                    let deletePromises = result.map(doc => {
                        return frappe.call({
                            method: 'frappe.client.delete',
                            args: {
                                doctype: "Project Work Efforts",
                                name: doc.name
                            }
                        });
                    });
                    return Promise.all(deletePromises);
                } else {
                    console.warn(`PWE для роли "${role}" не найден!`);

                    return frappe.db.get_list("Project Work Efforts", {
                        filters: {
                            pwe_project: cur_frm.doc.name,
                            pwe_task: task
                        },
                        fields: ["name", "pwe_project_role"],
                        limit: 100
                    }).then(() => Promise.resolve());
                }
            }).then(() => {
                let aggregatedTasks = cur_frm.aggregatedTasks || [];
                let taskData = null;

                if (Array.isArray(aggregatedTasks)) {
                    taskData = aggregatedTasks.find(t => t && t.value === task);
                } else {
                    taskData = aggregatedTasks[task];
                }

                if (taskData && taskData.role_data) {
                    taskData.role_data = taskData.role_data.filter(r => r.role !== role);
                } else {
                    console.warn(`taskData или role_data не найдены!`);
                }

                // Очистка кэша назначений
                project_workload_assignment.work_efforts.clear_assignments_cache();

                if (cur_frm._tasksByParent) {
                    cur_frm._tasksByParent = null;
                }
                project_workload_assignment.work_efforts.clearTaskIndexCacheFor(cur_frm.aggregatedTasks);

                project_workload_assignment.work_efforts.buildWorkloadPeriodsMap(cur_frm).then(() => {
                    if (cur_frm.show_assignments) {
                        project_workload_assignment.work_efforts.load_all_assignments_if_needed(cur_frm).then(() => {
                            project_workload_assignment.work_efforts.updateTable(cur_frm, "month", "hours");
                        });
                    } else {
                        project_workload_assignment.work_efforts.updateTable(cur_frm, "month", "hours");
                    }
                });

                frappe.show_alert({
                    message: __('Роль удалена'),
                    indicator: 'green'
                }, 3);
            }).catch(err => {
                console.error("Ошибка при удалении роли:", err);
                frappe.msgprint(__("Ошибка при удалении роли"));
            });
        }
    );
});
