// we-table/cell-edit.js — updateForecastValue, save_forecast_as_plan, edit event handlers
// ISS-2025-01239

/**
 * @param {string} taskId
 * @param {string} role
 * @param {DisplayPeriod} period
 * @param {Record<string, ConsolidatedTaskEntry>} aggregatedTasks
 * @returns {number}
 */
function get_child_forecast_sum(taskId, role, period, aggregatedTasks) {
    let sum = 0;
    Object.values(aggregatedTasks).forEach(child => {
        if (child.parent_task === taskId) {
            let childRoleEntry = (child.role_data || []).find(r => r.role === role);
            let forecastKey = `forecast_${period.year}_${period.month}`;
            let childForecast = childRoleEntry ? parseFloat(childRoleEntry[forecastKey]) || 0 : 0;
            if (childForecast > 0) {
                sum += childForecast;
            } else {
                sum += get_child_forecast_sum(child.value, role, period, aggregatedTasks);
            }
        }
    });
    return sum;
}

/* Функция для определения максимального допустимого значения в дочерней задаче */
function get_parent_forecast_limit(taskId, role, period, aggregatedTasks) {
    let currentTask = aggregatedTasks[taskId];
    let excluded = [];
    while (currentTask && currentTask.parent_task) {
        excluded.push(currentTask.value);
        let parent = aggregatedTasks[currentTask.parent_task];
        if (parent) {
            let parentRoleEntry = (parent.role_data || []).find(r => r.role === role);
            let forecastKey = `forecast_${period.year}_${period.month}`;
            let parentForecast = parentRoleEntry ? parseFloat(parentRoleEntry[forecastKey]) || 0 : 0;
            if (parentForecast > 0) {
                let siblingsSum = get_child_forecast_sum(
                    parent.value,
                    role,
                    period,
                    Object.values(aggregatedTasks).filter(el => excluded.indexOf(el.value) < 0)
                );
                let maxAllowed = parentForecast - siblingsSum;
                return maxAllowed;
            }
        }
        currentTask = parent;
    }
    return null;
}

/**
 * @param {string} task
 * @param {string} role
 * @param {number | string} year
 * @param {number | string} month
 * @param {number} new_value
 */
function updateForecastValue(task, role, year, month, new_value) {
    frappe.db.get_list("Project Work Efforts", {
        filters: {
            pwe_project: cur_frm.doc.name,
            pwe_task: task,
            pwe_project_role: role
        },
        fields: ["name"],
        limit: 1
    }).then(result => {
        if (result && result.length > 0) {
            return frappe.db.get_doc("Project Work Efforts", result[0].name);
        } else {
            let new_doc = {
                doctype: "Project Work Efforts",
                pwe_project: cur_frm.doc.name,
                pwe_task: task,
                pwe_project_role: role
            };
            return frappe.db.insert(new_doc);
        }
    }).then(doc => {
        let existRow = doc.pwe_amount.find(row => row.pwea_year == year && row.pwea_month == month);
        if (!existRow) {
            let newRow = frappe.model.add_child(doc, "Project Work Efforts Amount", "pwe_amount");
            newRow.pwea_year = year;
            newRow.pwea_month = month;
            newRow.pwea_expected = new_value;
        } else {
            existRow.pwea_expected = new_value;
        }

        return frappe.call({
            method: 'frappe.client.save',
            args: { doc: doc }
        });
    }).then(result => {
        frappe.show_alert({
            message: __('Data updated successfully'),
            indicator: 'green'
        }, 5);

        // Очистка кэша назначений
        project_workload_assignment.work_efforts.clear_assignments_cache();

        let aggregatedTasks = cur_frm.aggregatedTasks || [];
        let taskData = null;

        if (Array.isArray(aggregatedTasks)) {
            taskData = aggregatedTasks.find(t => t && t.value === task);
        } else {
            taskData = aggregatedTasks[task];
        }

        if (taskData && taskData.role_data) {
            let roleEntry = taskData.role_data.find(r => r.role === role);
            if (roleEntry) {
                roleEntry[`forecast_${year}_${month}`] = new_value;
            } else {
                taskData.role_data.push({
                    role: role,
                    [`forecast_${year}_${month}`]: new_value
                });
            }
        }

        project_workload_assignment.work_efforts.clearTaskIndexCacheFor(cur_frm.aggregatedTasks);
        project_workload_assignment.work_efforts.buildWorkloadPeriodsMap(cur_frm).then(() => {
            project_workload_assignment.work_efforts.updateTable(cur_frm, "month", "hours");
        });

        project_workload_assignment.work_efforts.render_work_efforts_chart(cur_frm, false);
    }).catch(err => {
        frappe.msgprint(__("Error updating forecast"));
        console.error(err);
    });
}

/**
 * Сохранение отмеченных plan-значений через work_efforts_api.save_forecast_as_plan.
 * @param {WorkEffortsForm} frm
 */
function save_forecast_as_plan(frm) {
    let periods = project_workload_assignment.work_efforts.get_display_periods(frm, "month");
    let checkedRows = frm.work_efforts_dt.rowmanager.getCheckedRows();

    let data = [];
    let hasChanges = false;

    for (let i = 0; i < checkedRows.length; i++) {
        let taskObj = frm.work_efforts_dt.datamanager.getData(checkedRows[i]);
        let task = taskObj.value;

        if (taskObj.role_data && Array.isArray(taskObj.role_data)) {
            taskObj.role_data.forEach(roleEntry => {
                let role = roleEntry.role || "";

                periods.forEach(period => {
                    let new_plan_value = 0;
                    let current_plan = parseFloat(roleEntry[`plan_${period.year}_${period.month}`]) || 0;

                    if (period.is_past) {
                        let factKey = `fact_${period.year}_${period.month}`;
                        new_plan_value = parseFloat(roleEntry[factKey]) || 0;
                    } else {
                        let forecastKey = `forecast_${period.year}_${period.month}`;
                        new_plan_value = parseFloat(roleEntry[forecastKey]) || 0;
                    }

                    if (new_plan_value !== current_plan && (new_plan_value > 0 || current_plan > 0)) {
                        hasChanges = true;
                        data.push({
                            task: task,
                            role: role,
                            year: period.year,
                            month: period.month,
                            plan_value: new_plan_value,
                            current_plan: current_plan
                        });
                    }
                });
            });
        }
    }

    if (!hasChanges) {
        frappe.msgprint(__("No changes to save."));
        return;
    }

    if (data.length === 0) {
        frappe.msgprint(__("No data to save."));
        return;
    }

    frappe.call({
        method: "project_workload_assignment.project_workload_api.save_forecast_as_plan",
        args: {
            project: frm.doc.name,
            data: JSON.stringify(data)
        },
        freeze: true,
        freeze_message: __("Saving data..."),
        callback: function(r) {
            if (!r.exc) {
                frappe.show_alert(__("Data saved as plan successfully"), 5);

                // Очистка кэша назначений
                project_workload_assignment.work_efforts.clear_assignments_cache();

                // Сбрасываем кэш загрузки
                frm.last_loaded_time = null;
                frm.last_loaded_project = null;

                // Очищаем кэш данных
                project_workload_assignment.work_efforts.clearTaskIndexCacheFor(frm.aggregatedTasks);

                // Очистка подсветки
                frm._missingPlanMap = {};
                frm._missingPlanPeriodsMap = {};

                // Загружаем данные заново
                project_workload_assignment.work_efforts.load_work_efforts_data(frm, "month", "hours", true);

                if (typeof load_and_render_project_dashboard === 'function') {
                    load_and_render_project_dashboard(frm);
                }
            }
        }
    });
}

Object.assign(project_workload_assignment.work_efforts, {
    updateForecastValue,
    save_forecast_as_plan,
});

// При клике по значению "факт/прогноз" (старая структура)
$(document).on('click', '.we-group-actual .editable-forecast', function(e) {
    if ($(this).find('input').length > 0) return;

    let $span = $(this);
    let currentValue = $span.text().trim();

    let $input = $(`<input type="number" min="0" class="we-edit-input">`)
        .val(currentValue)
        .data('original-value', currentValue);

    $span.html($input);
    $input.focus();
});

// При потере фокуса input – сохраняем значение
$(document).on('blur', '.we-edit-input', function(e) {
    let $input = $(this);
    let new_value = parseFloat($input.val());

    let original_value = $input.data('original-value');
    if (new_value == original_value) {
        $input.parent().text(original_value);
        return;
    }

    // Ищем данные через новую структуру
    let $container = $input.closest('.we-columns-container');
    let $roleValue = $input.closest('.we-role-value');
    let year = $container.data('year');
    let month = $container.data('month');
    let task = $container.data('task');
    let role = $roleValue.data('role');

    // Если не нашли — пробуем старую структуру
    if (!task) {
        let $group = $input.closest('.work-efforts-group');
        year = $group.data('year');
        month = $group.data('month');
        task = $group.data('task');
        role = $group.data('role');
    }

    let period = { year: year, month: month };

    let aggregatedTasks = cur_frm.aggregatedTasks || {};

    let isParent = Object.values(aggregatedTasks).some(t => t.parent_task === task);
    if (isParent) {
        let childrenSum = get_child_forecast_sum(task, role, period, aggregatedTasks);
        if (new_value < childrenSum) {
            frappe.msgprint(__("Value cannot be less than the sum of child task work efforts (" + childrenSum + ")"));
            $input.addClass("error");
            return;
        }
    }

    let parentLimit = get_parent_forecast_limit(task, role, period, aggregatedTasks);
    if (parentLimit !== null && (new_value > parentLimit)) {
        frappe.msgprint(__("Work effort value cannot exceed {0} (parent task limit)", [parentLimit]));
        $input.addClass("error");
        return;
    }

    $input.parent().text(new_value || 0);
    project_workload_assignment.work_efforts.updateForecastValue(task, role, year, month, new_value);
});

// При двойном клике по значению "факт" (старая структура)
// https://erp.dinord.ru/app/issue/ISS-2025-01237
$(document).on('dblclick', '.we-group-actual:not(.zero):has(.readonly-fact)', function(e) {
    let $actual = $(this);
    let $group = $actual.closest('.work-efforts-group');
    let year = $group.data('year');
    let month = $group.data('month');
    let task = $group.data('task');
    let role = $group.data('role');
    let utps = [];

    if (typeof task === 'undefined' || typeof role === 'undefined') {
        let periods = project_workload_assignment.work_efforts.get_display_periods(cur_frm, "month");
        let period = periods.find(period => period.year == year && period.month == month);

        if (period.is_past) {
            Object.values(cur_frm.aggregatedTasks).forEach(task => {
                (task.role_data || []).forEach(roleEntry => {
                    let factUTPs = `fact_utps_${year}_${flt(month)}`;
                    let monthUTPS = roleEntry[factUTPs];
                    if (monthUTPS) {
                        utps.push(...monthUTPS);
                    }
                });
            });
        }
    } else {
        let roleEntry = cur_frm.aggregatedTasks[task]?.role_data?.find(r => r.role === role);

        if (roleEntry) {
            if (typeof year === 'undefined' || typeof month === 'undefined') {
                let periods = project_workload_assignment.work_efforts.get_display_periods(cur_frm, "month");
                periods.forEach(period => {
                    if (period.is_past) {
                        let factUTPs = `fact_utps_${period.year}_${period.month}`;
                        let monthUTPS = roleEntry[factUTPs];
                        if (monthUTPS) {
                            utps.push(...monthUTPS);
                        }
                    }
                });
            } else {
                let factUTPs = `fact_utps_${year}_${flt(month)}`;
                utps = roleEntry[factUTPs];
            }
        }
    }

    if (utps && utps.length) {
        frappe.route_options = {
            name: ["in", utps]
        };
        frappe.set_route('list', 'User Timesheet Position');
    }
});

// Обработчик клика на строку назначений
$(document).on('click', '.assignment-row', function(e) {
    e.stopPropagation();

    let task_id = $(this).data('task');
    if (!task_id) {
        let $row = $(this).closest('.dt-row');
        let rowIndex = $row.data('row-index');
        if (rowIndex !== undefined) {
            let rowData = cur_frm.work_efforts_dt.datamanager.getData(rowIndex);
            if (rowData && rowData.value) {
                task_id = rowData.value;
            }
        }
    }

    if (!task_id) return;

    let task_data = cur_frm.aggregatedTasks[task_id];
    if (!task_data) return;

    let task = {
        name: task_id,
        project: cur_frm.doc.name,
        subject: task_data.subject,
        exp_start_date: task_data.exp_start_date,
        exp_end_date: task_data.exp_end_date
    };

    if (typeof start_pwa_dialog === 'function') {
        start_pwa_dialog(function(pwas) {
            project_workload_assignment.work_efforts.clear_assignments_cache();

            project_workload_assignment.work_efforts.load_all_assignments_if_needed(cur_frm).then(() => {
                project_workload_assignment.work_efforts.updateTable(cur_frm, "month", "hours");

                setTimeout(() => {
                    project_workload_assignment.work_efforts.check_plan_load_for_percentage_assignments(cur_frm);
                }, 300);
            });

            frappe.show_alert({
                message: __('Assignments updated'),
                indicator: 'green'
            }, 3);
        }, task);
    } else {
        frappe.msgprint(__("Assignment function is unavailable"));
    }
});

// ========== НОВЫЕ ОБРАБОТЧИКИ ДЛЯ СТРУКТУРЫ С КОЛОНКАМИ ==========

// Клик для редактирования прогноза (новая структура)
$(document).on('click', '.we-role-value .editable-forecast', function(e) {
    if ($(this).find('input').length > 0) return;
    let $span = $(this);
    let currentValue = $span.text().trim();
    let $input = $(`<input type="number" min="0" class="we-edit-input">`)
        .val(currentValue)
        .data('original-value', currentValue);
    $span.html($input);
    $input.focus();
});

// Двойной клик по факту (новая структура)
$(document).on('dblclick', '.we-role-value:not(.zero):has(.readonly-fact)', function(e) {
    let $actual = $(this);
    let $container = $actual.closest('.we-columns-container');
    let year = $container.data('year');
    let month = $container.data('month');
    let task = $container.data('task');
    let role = $actual.data('role');
    let utps = [];

    if (typeof task === 'undefined' || typeof role === 'undefined') {
        let periods = project_workload_assignment.work_efforts.get_display_periods(cur_frm, "month");
        let period = periods.find(p => p.year == year && p.month == month);
        if (period && period.is_past) {
            Object.values(cur_frm.aggregatedTasks).forEach(t => {
                (t.role_data || []).forEach(roleEntry => {
                    let factUTPs = `fact_utps_${year}_${flt(month)}`;
                    let monthUTPS = roleEntry[factUTPs];
                    if (monthUTPS) utps.push(...monthUTPS);
                });
            });
        }
    } else {
        let roleEntry = cur_frm.aggregatedTasks[task]?.role_data?.find(r => r.role === role);
        if (roleEntry) {
            let factUTPs = `fact_utps_${year}_${flt(month)}`;
            let monthUTPS = roleEntry[factUTPs];
            if (monthUTPS) utps.push(...monthUTPS);
        }
    }

    if (utps && utps.length) {
        frappe.route_options = { name: ["in", utps] };
        frappe.set_route('list', 'User Timesheet Position');
    }
});
