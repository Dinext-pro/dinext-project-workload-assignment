// we-table/limits.js — recalculatePeriodLimits, refreshLimitHighlight
// ISS-2025-01239 — W3b: positions from we.rows (aggregatedTasks fallback)

/**
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
 * Past-period fact positions for timesheet limits API.
 * Prefer we; fallback aggregatedTasks (lazy dialogs / transition).
 * @param {WorkEffortsForm} frm
 * @param {DisplayPeriod[]} periods
 * @returns {TimesheetPositionInput[]}
 */
function collectPeriodPositions(frm, periods) {
    /** @type {TimesheetPositionInput[]} */
    const periodPositions = [];
    const weRows = project_workload_assignment.work_efforts.flattenWeRows?.(frm.we?.rows, []) || [];

    if (weRows.length) {
        weRows.forEach((row) => {
            const taskId = row.task_id;
            const roleName = row.role || "";
            if (!taskId) return;

            periods.forEach((period) => {
                if (!period.is_past) return;
                const key = period.key || `${period.year}_${period.month}`;
                const fact = parseFloat(row[`fact_${key}`]) || 0;
                if (fact === 0) return;

                periodPositions.push({
                    name: `${taskId}_${roleName}_${period.year}_${period.month}`,
                    document_name: taskId,
                    project_role: roleName,
                    project: frm.doc.name,
                    status: "Approved",
                    all_hours: fact,
                    year: period.year,
                    month: period.month,
                });
            });
        });
        return periodPositions;
    }

    Object.values(frm.aggregatedTasks || {}).forEach((task) => {
        (task.role_data || []).forEach((roleEntry) => {
            const roleName = roleEntry.role || "";

            periods.forEach((period) => {
                if (!period.is_past) return;

                const fact = parseFloat(roleEntry[`fact_${period.year}_${period.month}`]) || 0;
                if (fact === 0) return;

                periodPositions.push({
                    name: `${task.value}_${roleName}_${period.year}_${period.month}`,
                    document_name: task.value,
                    project_role: roleName,
                    project: frm.doc.name,
                    status: "Approved",
                    all_hours: fact,
                    year: period.year,
                    month: period.month,
                });
            });
        });
    });

    return periodPositions;
}

/**
 * @param {WorkEffortsForm} frm
 * @param {string} periodType
 * @param {() => void} [callback]
 */
function recalculatePeriodLimits(frm, periodType, callback) {
    const periods =
        (frm.we?.periods?.length && frm.we.periods) ||
        project_workload_assignment.work_efforts.get_display_periods(frm, periodType);
    const periodPositions = collectPeriodPositions(frm, periods);

    /** @type {Record<string, unknown>} */
    let apiArgs = {
        timesheet_name: "",
        positions: periodPositions,
    };

    let limitsOverride = getProjectLimitsOverride(frm);
    if (limitsOverride) {
        apiArgs.project_limits = limitsOverride;
    }

    if (periodPositions.length > 0) {
        frappe.call({
            method: "project_workload_assignment.project_workload_api.calculate_timesheet_limits",
            args: apiArgs,
            callback: function (r) {
                if (r.message) {
                    frm.periodLimitStatuses = {};
                    r.message.forEach((item) => {
                        frm.periodLimitStatuses[item.position] = {
                            status: item.status,
                            pct: item.completion_percentage,
                            limit: item.limit,
                        };
                    });
                }
                if (callback) callback();
            },
        });
    } else {
        frm.periodLimitStatuses = {};
        if (callback) callback();
    }
}

/**
 * @param {WorkEffortsForm} frm
 */
function refreshLimitHighlight(frm) {
    if (!window.WorkEfforts?.refreshLimitHighlight) {
        return;
    }
    project_workload_assignment.work_efforts.recalculatePeriodLimits(
        frm,
        frm._we_period_type || "month",
        () => window.WorkEfforts.refreshLimitHighlight(frm)
    );
}

Object.assign(project_workload_assignment.work_efforts, {
    recalculatePeriodLimits,
    refreshLimitHighlight,
});

frappe.ui.form.on("Limit Control", "limit", function (frm) {
    project_workload_assignment.work_efforts.refreshLimitHighlight(frm);
});

frappe.ui.form.on("Limit Control", "type", function (frm) {
    project_workload_assignment.work_efforts.refreshLimitHighlight(frm);
});

frappe.ui.form.on("Limit Control", {
    custom_limit_control_table_remove: function (frm) {
        project_workload_assignment.work_efforts.refreshLimitHighlight(frm);
    },
});
