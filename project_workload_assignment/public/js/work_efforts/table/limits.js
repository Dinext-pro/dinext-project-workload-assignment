// we-table/limits.js — recalculatePeriodLimits, refreshLimitHighlight, setCellStyles
// ISS-2025-01239

/**
 * Пороги из child table «Контроль лимитов» (актуальные значения формы, в т.ч. до save).
 * @param {WorkEffortsForm} frm
 * @returns {Array<{type: string, limit: number}> | null}
 */
function getProjectLimitsOverride(frm) {
    let rows = frm.doc.custom_limit_control_table || [];
    if (!rows.length) {
        return null;
    }
    return rows
        .filter((row) => row.type)
        .map((row) => ({ type: row.type, limit: row.limit }));
}

/**
 * Расчёт лимитов по периодам через work_efforts_api.calculate_timesheet_limits.
 * @param {WorkEffortsForm} frm
 * @param {string} periodType
 * @param {() => void} [callback]
 */
function recalculatePeriodLimits(frm, periodType, callback) {
    /** @type {TimesheetPositionInput[]} */
    let periodPositions = [];
    let periods = project_workload_assignment.work_efforts.get_display_periods(frm, periodType);

    Object.values(frm.aggregatedTasks || {}).forEach(task => {
        (task.role_data || []).forEach(roleEntry => {
            let roleName = roleEntry.role || '';

            periods.forEach(period => {
                if (!period.is_past) return;

                let fact = parseFloat(roleEntry[`fact_${period.year}_${period.month}`]) || 0;
                if (fact === 0) return;

                periodPositions.push({
                    name: `${task.value}_${roleName}_${period.year}_${period.month}`,
                    document_name: task.value,
                    project_role: roleName,
                    project: frm.doc.name,
                    status: 'Approved',
                    all_hours: fact,
                    year: period.year,
                    month: period.month
                });
            });
        });
    });

    /** @type {Record<string, unknown>} */
    let apiArgs = {
        timesheet_name: '',
        positions: periodPositions,
    };

    let limitsOverride = getProjectLimitsOverride(frm);
    if (limitsOverride) {
        apiArgs.project_limits = limitsOverride;
    }

    if (periodPositions.length > 0) {
        frappe.call({
            method: 'project_workload_assignment.project_workload_api.calculate_timesheet_limits',
            args: apiArgs,
            callback: function(r) {
                if (r.message) {
                    frm.periodLimitStatuses = {};
                    r.message.forEach(item => {
                        frm.periodLimitStatuses[item.position] = {
                            status: item.status,
                            pct: item.completion_percentage,
                            limit: item.limit
                        };
                    });
                }
                if (callback) callback();
            }
        });
    } else {
        frm.periodLimitStatuses = {};
        if (callback) callback();
    }
}

/**
 * Пересчитать обводку лимитов в таблице (без полной перезагрузки данных).
 * @param {WorkEffortsForm} frm
 */
function refreshLimitHighlight(frm) {
    if (!frm.work_efforts_dt || !frm.aggregatedTasks) {
        return;
    }
    let periodType = frm._we_period_type || "month";
    let unit = frm._we_unit || "hours";
    project_workload_assignment.work_efforts.updateTable(frm, periodType, unit, true);
}

function setCellStyles() {
    $(".work-efforts-table .datatable .dt-scrollable").addClass("dt-fit-height");
}

Object.assign(project_workload_assignment.work_efforts, {
    recalculatePeriodLimits,
    refreshLimitHighlight,
    setCellStyles,
});

frappe.ui.form.on("Limit Control", "limit", function(frm) {
    project_workload_assignment.work_efforts.refreshLimitHighlight(frm);
});

frappe.ui.form.on("Limit Control", "type", function(frm) {
    project_workload_assignment.work_efforts.refreshLimitHighlight(frm);
});

frappe.ui.form.on("Limit Control", {
    custom_limit_control_table_remove: function(frm) {
        project_workload_assignment.work_efforts.refreshLimitHighlight(frm);
    },
});
