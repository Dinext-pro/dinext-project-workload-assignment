// ========== КЭШИ ДЛЯ НАЗНАЧЕНИЙ ==========
let assignmentsCache = {};
let allAssignmentsLoaded = false;
let isLoadingAssignments = false;

/**
 * Загрузка всех назначений проекта (один запрос).
 * @param {WorkEffortsForm} frm
 * @returns {Promise<void>}
 */
function load_all_assignments_if_needed(frm) {
    if (allAssignmentsLoaded) {
        return Promise.resolve();
    }

    if (isLoadingAssignments) {
        return new Promise((resolve) => {
            let checkInterval = setInterval(() => {
                if (allAssignmentsLoaded) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        });
    }

    isLoadingAssignments = true;
    let task_ids = Object.keys(frm.aggregatedTasks);

    if (task_ids.length === 0) {
        allAssignmentsLoaded = true;
        isLoadingAssignments = false;
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        frappe.call({
            method: "frappe.client.get_list",
            args: {
                doctype: "Project Workload Assignment",
                filters: [
                    ["task", "in", task_ids]
                ],
                fields: ["task", "role", "user", "user_full_name", "workload", "wl_value", "date_from", "date_to"],
                limit: 0,
                limit_page_length: 999999
            },
            callback: function(res) {
                if (res.message) {
                    res.message.forEach(assignment => {
                        if (!assignmentsCache[assignment.task]) {
                            assignmentsCache[assignment.task] = [];
                        }
                        assignmentsCache[assignment.task].push(assignment);
                    });

                    if (!frm._detailedAssignments) {
                        frm._detailedAssignments = {};
                    }
                    res.message.forEach(assignment => {
                        if (!frm._detailedAssignments[assignment.task]) {
                            frm._detailedAssignments[assignment.task] = [];
                        }
                        frm._detailedAssignments[assignment.task].push(assignment);
                    });

                    frm._detailedAssignmentsLoaded = true;
                }
                allAssignmentsLoaded = true;
                isLoadingAssignments = false;
                resolve();
            },
            error: function() {
                allAssignmentsLoaded = true;
                isLoadingAssignments = false;
                resolve();
            }
        });
    });
}

/**
 * @param {string} task_id
 * @returns {WorkloadAssignment[]}
 */
function get_task_assignments(task_id) {
    return assignmentsCache[task_id] || [];
}

/** @param {WorkEffortsForm} frm */
function check_plan_load_for_percentage_assignments(frm) {
    if (!frm.aggregatedTasks || Object.keys(frm.aggregatedTasks).length === 0) {
        frappe.msgprint(__("Сначала дождитесь загрузки данных таблицы трудозатрат"));
        return;
    }

    if (!frm.work_efforts_dt) {
        frappe.msgprint(__("Таблица трудозатрат еще не инициализирована"));
        return;
    }

    if (frm.hide_plan) {
        frm.hide_plan = false;
        $('#toggle_plan').text(__("Скрыть план"));
    }

    project_workload_assignment.work_efforts.load_detailed_assignments(frm).then(() => {
        let task_ids = Object.keys(frm.aggregatedTasks);
        let missingPlanMap = {};
        let missingPlanPeriodsMap = {};
        let periods = project_workload_assignment.work_efforts.get_display_periods(frm, "month");

        for (let task_id of task_ids) {
            let task_data = frm.aggregatedTasks[task_id];
            if (!task_data) continue;

            let detailed_assignments = frm._detailedAssignments?.[task_id] || [];

            let has_percentage_assignment = detailed_assignments.some(
                a => a.workload === "В % от трудоемкости задачи"
            );

            if (!has_percentage_assignment) {
                continue;
            }

            let role_period_load = {};

            detailed_assignments.forEach(assignment => {
                let role = assignment.role || "Без роли";
                let date_from = assignment.date_from;
                let date_to = assignment.date_to;
                let wl_value = parseFloat(assignment.wl_value) || 0;

                if (wl_value <= 0) return;

                if (!role_period_load[role]) {
                    role_period_load[role] = new Set();
                }

                periods.forEach(period => {
                    let period_start = new Date(period.year, period.month - 1, 1);
                    let period_end = new Date(period.year, period.month, 0);
                    let assign_from = date_from ? new Date(date_from) : null;
                    let assign_to = date_to ? new Date(date_to) : null;
                    let has_overlap = false;

                    if (assign_from && assign_to) {
                        has_overlap = (period_start <= assign_to && period_end >= assign_from);
                    } else if (assign_from && !assign_to) {
                        has_overlap = period_end >= assign_from;
                    } else if (!assign_from && assign_to) {
                        has_overlap = period_start <= assign_to;
                    } else {
                        has_overlap = true;
                    }

                    if (has_overlap) {
                        let period_key = `${period.year}_${period.month}`;
                        role_period_load[role].add(period_key);
                    }
                });
            });

            Object.keys(role_period_load).forEach(role_name => {
                let role_entry = (task_data.role_data || []).find(r => r && r.role === role_name);
                let loaded_periods = Array.from(role_period_load[role_name]);

                if (loaded_periods.length === 0) return;

                let has_plan = false;
                let missing_periods = [];

                loaded_periods.forEach(period_key => {
                    let plan_key = `plan_${period_key}`;
                    let plan_value = role_entry ? (parseFloat(role_entry[plan_key]) || 0) : 0;

                    if (plan_value > 0) {
                        has_plan = true;
                    } else {
                        let [year, month] = period_key.split('_');
                        missing_periods.push({
                            year: parseInt(year),
                            month: parseInt(month),
                            period_key: period_key
                        });
                    }
                });

                if (!has_plan) {
                    if (!missingPlanMap[task_id]) {
                        missingPlanMap[task_id] = [];
                    }
                    if (!missingPlanMap[task_id].includes(role_name)) {
                        missingPlanMap[task_id].push(role_name);
                    }
                }

                if (missing_periods.length > 0) {
                    if (!missingPlanPeriodsMap[task_id]) {
                        missingPlanPeriodsMap[task_id] = {};
                    }
                    missingPlanPeriodsMap[task_id][role_name] = missing_periods;
                }
            });
        }

        frm._missingPlanMap = missingPlanMap;
        frm._missingPlanPeriodsMap = missingPlanPeriodsMap;

        project_workload_assignment.work_efforts.updateTable(frm, "month", "hours");

        setTimeout(() => {
            let rows = frm.work_efforts_dt.datamanager.getRows();
            if (rows && rows.length) {
                project_workload_assignment.work_efforts.expandParents(frm, missingPlanMap);
            }
        }, 300);

        let problemsCount = Object.values(missingPlanMap).reduce((sum, roles) => sum + roles.length, 0);
        if (problemsCount > 0) {
            frappe.show_alert({
                message: __("Найдено {0} задач с загрузкой в % от трудоемкости без плановых трудозатрат", [problemsCount]),
                indicator: "orange"
            }, 5);
        } else {
            frappe.show_alert({
                message: __("Не найдено задач с загрузкой в % от трудоемкости без плановых трудозатрат"),
                indicator: "green"
            }, 3);
        }
    });
}

/**
 * @param {WorkEffortsForm} frm
 * @returns {Promise<void>}
 */
function load_detailed_assignments(frm) {
    if (frm._detailedAssignmentsLoaded) {
        return Promise.resolve();
    }

    let task_ids = Object.keys(frm.aggregatedTasks);

    if (task_ids.length === 0) {
        frm._detailedAssignmentsLoaded = true;
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        frappe.call({
            method: "frappe.client.get_list",
            args: {
                doctype: "Project Workload Assignment",
                filters: [
                    ["task", "in", task_ids]
                ],
                fields: ["task", "role", "user", "user_full_name", "workload", "wl_value", "date_from", "date_to"],
                limit: 0,
                limit_page_length: 999999
            },
            callback: function(res) {
                if (res.message) {
                    frm._detailedAssignments = {};
                    res.message.forEach(assignment => {
                        if (!frm._detailedAssignments[assignment.task]) {
                            frm._detailedAssignments[assignment.task] = [];
                        }
                        frm._detailedAssignments[assignment.task].push(assignment);
                    });
                }
                frm._detailedAssignmentsLoaded = true;
                resolve();
            },
            error: function() {
                frm._detailedAssignmentsLoaded = true;
                resolve();
            }
        });
    });
}

/**
 * Очистка всех кэшей назначений
 */
function clear_assignments_cache() {
    assignmentsCache = {};
    allAssignmentsLoaded = false;
    isLoadingAssignments = false;

    if (cur_frm) {
        cur_frm._detailedAssignments = null;
        cur_frm._detailedAssignmentsLoaded = false;
        cur_frm._workloadPeriodsMap = null;
    }
}

/**
 * @param {WorkEffortsForm} frm
 * @param {Record<string, string[]>} missingPlanMap
 */
function expandParents(frm, missingPlanMap) {
    if (!frm.work_efforts_dt || !frm.work_efforts_dt.rowmanager) return;

    let tableData = frm.work_efforts_dt.datamanager.data;

    let parentsToExpand = new Set();
    for (let task_id in missingPlanMap) {
        let current = frm.aggregatedTasks[task_id];
        if (current && current.parent_task) {
            parentsToExpand.add(current.parent_task);
        }
    }
    
    let allParentIndices = [];
    for (let i = 0; i < tableData.length; i++) {
        let taskId = tableData[i]?.value;
        let hasChildren = Object.values(frm.aggregatedTasks).some(t => t.parent_task === taskId);
        if (hasChildren) {
            allParentIndices.push(i);
        }
    }
    
    let indicesToExpand = [];
    for (let parentId of parentsToExpand) {
        for (let i = 0; i < tableData.length; i++) {
            if (tableData[i]?.value === parentId) {
                indicesToExpand.push(i);
                break;
            }
        }
    }
    let indicesToCollapse = allParentIndices.filter(idx => !indicesToExpand.includes(idx));
    
    for (let idx of allParentIndices) {
        try { frm.work_efforts_dt.rowmanager.openSingleNode(idx); } catch(e) {}
    }
    
    for (let idx of indicesToCollapse) {
        let taskId = tableData[idx]?.value;
        let taskDiv = document.querySelector(`.work-efforts-table .dt-row [data-task-id="${taskId}"]`);
        if (taskDiv) {
            let row = taskDiv.closest('.dt-row');
            let chevronIcon = row.querySelector('.dt-tree-node__toggle svg.feather-chevron-down');
            if (chevronIcon) {
                chevronIcon.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            }
        }
    }
}

// ========== КАСТОМНЫЕ ТУЛТИПЫ ==========
let $customTooltip = null;
let tooltipTimeout = null;
let currentTooltipTarget = null;

function initCustomTooltip() {
    if ($customTooltip) return;

    $customTooltip = $('<div class="custom-workload-tooltip"></div>').appendTo('body');
    $customTooltip.css({
        position: 'fixed',
        background: 'var(--alert-bg-warning)',
        color: 'var(--alert-text-warning)',
        padding: '5px 10px',
        borderRadius: '4px',
        fontSize: '12px',
        zIndex: '99999',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
        display: 'none'
    });
}

function updateTooltipPosition(target) {
    if (!target) return;

    let rect = target.getBoundingClientRect();
    let tooltipRect = $customTooltip[0].getBoundingClientRect();
    let top = rect.bottom + 5;
    let left = rect.left;

    if (left + tooltipRect.width > window.innerWidth) {
        left = window.innerWidth - tooltipRect.width - 10;
    }
    if (left < 10) {
        left = 10;
    }

    $customTooltip.css({
        top: top + 'px',
        left: left + 'px'
    });
}

function showCustomTooltip(target, text) {
    if (!target) return;

    project_workload_assignment.work_efforts.initCustomTooltip();
    currentTooltipTarget = target;
    $customTooltip.text(text).show();
    updateTooltipPosition(target);

    if (tooltipTimeout) clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(() => {
        if (currentTooltipTarget === target) {
            project_workload_assignment.work_efforts.hideCustomTooltip();
        }
    }, 3000);
}

function hideCustomTooltip() {
    $customTooltip.hide();
    currentTooltipTarget = null;

    if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
        tooltipTimeout = null;
    }
}

$(document).on('mouseenter', '[data-tooltip]', function(e) {
    $(this).removeAttr('title');
    $(this).removeAttr('data-original-title');
    $(this).attr('title', '');

    if ($(this).tooltip) {
        $(this).tooltip('disable');
        $(this).tooltip('hide');
    }

    let text = $(this).attr('data-tooltip');
    if (text) {
        project_workload_assignment.work_efforts.showCustomTooltip(this, text);
    }
}).on('mouseleave', '[data-tooltip]', function() {
    project_workload_assignment.work_efforts.hideCustomTooltip();

    if ($(this).tooltip) {
        $(this).tooltip('enable');
    }
});

$(window).on('scroll', function() {
    if (currentTooltipTarget && $customTooltip && $customTooltip.is(':visible')) {
        updateTooltipPosition(currentTooltipTarget);
    }
});

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

/**
 * @param {DisplayPeriod} period
 * @param {string | null | undefined} startDate
 * @param {string | null | undefined} endDate
 * @returns {boolean}
 */
function isPeriodInTaskDates(period, startDate, endDate) {
    if (!startDate && !endDate) return false;

    let period_start = new Date(period.year, period.month - 1, 1);
    let period_end = new Date(period.year, period.month, 0);
    let task_start = startDate ? new Date(startDate) : null;
    let task_end = endDate ? new Date(endDate) : null;

    if (task_start && task_end) {
        return (period_start <= task_end && period_end >= task_start);
    } else if (task_start && !task_end) {
        return period_end >= task_start;
    } else if (!task_start && task_end) {
        return period_start <= task_end;
    }
    return false;
}

/**
 * @param {WorkEffortsForm} frm
 * @param {string} taskId
 * @param {string} role
 * @param {DisplayPeriod} period
 * @returns {boolean}
 */
function hasWorkloadInPeriod(frm, taskId, role, period) {
    let workloadPeriods = frm._workloadPeriodsMap?.[taskId]?.[role];
    if (workloadPeriods) {
        return workloadPeriods.has(`${period.year}_${period.month}`);
    }
    return false;
}

/**
 * @param {WorkEffortsForm} frm
 * @returns {Promise<void>}
 */
function buildWorkloadPeriodsMap(frm) {
    return project_workload_assignment.work_efforts.load_all_assignments_if_needed(frm).then(() => {
        let workloadMap = {};
        let periods = project_workload_assignment.work_efforts.get_display_periods(frm, "month");
        let task_ids = Object.keys(frm.aggregatedTasks);

        for (let task_id of task_ids) {
            let assignments = project_workload_assignment.work_efforts.get_task_assignments(task_id);
            if (!assignments || assignments.length === 0) continue;

            workloadMap[task_id] = {};

            let role_assignments = {};
            assignments.forEach(a => {
                let role = a.role || "Без роли";
                if (!role_assignments[role]) {
                    role_assignments[role] = [];
                }
                role_assignments[role].push(a);
            });

            Object.keys(role_assignments).forEach(role => {
                let periodSet = new Set();

                role_assignments[role].forEach(assignment => {
                    let date_from = assignment.date_from;
                    let date_to = assignment.date_to;
                    let wl_value = parseFloat(assignment.wl_value) || 0;

                    if (wl_value <= 0) return;

                    periods.forEach(period => {
                        let period_start = new Date(period.year, period.month - 1, 1);
                        let period_end = new Date(period.year, period.month, 0);
                        let assign_from = date_from ? new Date(date_from) : null;
                        let assign_to = date_to ? new Date(date_to) : null;
                        let has_overlap = false;

                        if (assign_from && assign_to) {
                            has_overlap = (period_start <= assign_to && period_end >= assign_from);
                        } else if (assign_from && !assign_to) {
                            has_overlap = period_end >= assign_from;
                        } else if (!assign_from && assign_to) {
                            has_overlap = period_start <= assign_to;
                        } else {
                            has_overlap = true;
                        }

                        if (has_overlap) {
                            periodSet.add(`${period.year}_${period.month}`);
                        }
                    });
                });

                if (periodSet.size > 0) {
                    workloadMap[task_id][role] = periodSet;
                }
            });
        }

        frm._workloadPeriodsMap = workloadMap;
    });
}

Object.assign(project_workload_assignment.work_efforts, {
    load_all_assignments_if_needed,
    get_task_assignments,
    check_plan_load_for_percentage_assignments,
    load_detailed_assignments,
    clear_assignments_cache,
    expandParents,
    initCustomTooltip,
    showCustomTooltip,
    hideCustomTooltip,
    isPeriodInTaskDates,
    hasWorkloadInPeriod,
    buildWorkloadPeriodsMap,
});
