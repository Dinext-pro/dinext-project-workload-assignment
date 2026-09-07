// we-table/data-load.js — lazy consolidated for dialogs (W3b: no dual boot)
// ISS-2025-01239

/**
 * @param {object[]} rows
 * @param {object[]} out
 * @returns {object[]}
 */
function flattenWeRows(rows, out) {
    const acc = out || [];
    for (const row of rows || []) {
        // SUMMARY_ROW_ID in work_efforts/constants.js (classic script — no ESM import).
        if (!row || row.merge_group_id === "we-total") continue;
        acc.push(row);
        if (row.children?.length) {
            flattenWeRows(row.children, acc);
        }
    }
    return acc;
}

/**
 * Lazy-fill frm.aggregatedTasks via consolidated API (overload / pl-from-we).
 * Does not run chart/limits — those use we after GRID load.
 * @param {WorkEffortsForm} frm
 * @returns {Promise<Record<string, ConsolidatedTaskEntry>>}
 */
function ensure_aggregated_tasks(frm) {
    return new Promise((resolve, reject) => {
        if (frm.aggregatedTasks && Object.keys(frm.aggregatedTasks).length) {
            resolve(frm.aggregatedTasks);
            return;
        }

        frappe.call({
            method: "project_workload_assignment.api.get_work_efforts_consolidated_data",
            args: {
                project: frm.doc.name,
                view_options: frm.view_options || "Forecast and Fact",
            },
            freeze: true,
            freeze_message: __("Loading work efforts data..."),
            callback: function (r) {
                if (!r.message) {
                    frappe.msgprint(__("Error loading work efforts data"));
                    reject(new Error("empty consolidated response"));
                    return;
                }

                frm.aggregatedTasks = {};
                (r.message || []).forEach((task) => {
                    if (task && task.value) {
                        frm.aggregatedTasks[task.value] = task;
                    }
                });
                resolve(frm.aggregatedTasks);
            },
            error: function (err) {
                console.error("Error loading work efforts data: {0}", [err]);
                frappe.msgprint(__("Error loading work efforts data"));
                reject(err);
            },
        });
    });
}

/**
 * Invalidate cached aggregatedTasks (after mutations that change PWE tree).
 * @param {WorkEffortsForm} frm
 */
function clear_aggregated_tasks(frm) {
    if (frm?.aggregatedTasks) {
        project_workload_assignment.work_efforts.clearTaskIndexCacheFor?.(frm.aggregatedTasks);
        frm.aggregatedTasks = null;
    }
}

/**
 * @deprecated Boot dual-load removed (W3b). Kept as alias for rare callers → ensure + no side effects.
 * @param {WorkEffortsForm} frm
 * @param {string} periodType
 * @param {string} unit
 * @param {boolean} [updateRows]
 */
function load_work_efforts_data(frm, periodType, unit, updateRows) {
    project_workload_assignment.work_efforts.clear_assignments_cache?.();
    clear_aggregated_tasks(frm);
    return ensure_aggregated_tasks(frm).then(() => {
        if (updateRows && window.WorkEfforts?.refresh) {
            return window.WorkEfforts.refresh(frm);
        }
    });
}

Object.assign(project_workload_assignment.work_efforts, {
    flattenWeRows,
    ensure_aggregated_tasks,
    clear_aggregated_tasks,
    load_work_efforts_data,
});
