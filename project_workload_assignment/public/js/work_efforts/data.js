import {
    PERIOD_FIELD_RE,
    ROW_ID_SEP,
    VIEW_OPTION_FORECAST_AND_FACT,
    normalizeViewMode,
} from "./constants.js";
import { initState } from "./state.js";
import { buildSummaryRows } from "./summary.js";

function rowId(apiRow) {
    return `${apiRow.task_id}${ROW_ID_SEP}${apiRow.role || ""}`;
}

function copyPeriodFields(apiRow, gridRow) {
    for (const [key, value] of Object.entries(apiRow)) {
        if (PERIOD_FIELD_RE.test(key) || key.startsWith("fact_utps_")) {
            gridRow[key] = value;
        }
    }
}

function copyTaskDates(apiRow, gridRow) {
    gridRow.exp_start_date = apiRow.exp_start_date || null;
    gridRow.exp_end_date = apiRow.exp_end_date || null;
    gridRow.custom_planned_start_date = apiRow.custom_planned_start_date || null;
    gridRow.custom_planned_end_date = apiRow.custom_planned_end_date || null;
    gridRow.act_start_date = apiRow.act_start_date || null;
    gridRow.act_end_date = apiRow.act_end_date || null;
}

function toGridRow(apiRow, index) {
    const gridRow = {
        id: rowId(apiRow),
        task_id: apiRow.task_id,
        task_subject: index === 0 ? apiRow.task_subject || "" : "",
        role: apiRow.role || "",
        parent_task_id: apiRow.parent_task_id || null,
        merge_group_id: apiRow.merge_group_id,
        merge_group_index: apiRow.merge_group_index,
        merge_group_size: apiRow.merge_group_size,
        has_children: apiRow.has_children,
    };
    copyTaskDates(apiRow, gridRow);
    copyPeriodFields(apiRow, gridRow);
    return gridRow;
}

export function buildTreeData(flatRows) {
    const taskOrder = [];
    const groupsByTask = new Map();

    for (const row of flatRows) {
        const taskId = row.task_id;
        if (!groupsByTask.has(taskId)) {
            groupsByTask.set(taskId, {
                apiRows: [],
                parent_task_id: row.parent_task_id || null,
            });
            taskOrder.push(taskId);
        }
        groupsByTask.get(taskId).apiRows.push(row);
    }

    function childNodes(parentTaskId) {
        const nodes = [];

        for (const taskId of taskOrder) {
            const group = groupsByTask.get(taskId);
            const parent = group.parent_task_id || null;
            if (parent !== parentTaskId) {
                continue;
            }

            const gridRows = group.apiRows.map((apiRow, index) => toGridRow(apiRow, index));
            const head = gridRows[0];
            const nested = childNodes(taskId);

            if (nested.length) {
                head.children = nested;
            }

            nodes.push(...gridRows);
        }

        return nodes;
    }

    return childNodes(null);
}

/** Rebuild tree from last API flat rows (drops synthetic remaining rows). */
export function rebuildRowsFromApi(frm) {
    const state = initState(frm);
    if (!state.flatApiRows) {
        return state.rows;
    }
    state.rows = buildTreeData(state.flatApiRows);
    return state.rows;
}

async function applyGridResponse(frm, message) {
    const state = initState(frm);
    state.periods = message.periods || [];
    state.flatApiRows = message.rows || [];
    state.rows = buildTreeData(state.flatApiRows);
    state.summaryRows = buildSummaryRows(frm, state.periods, message.summary_rows);
    // Force limits recompute from fresh we facts.
    frm.periodLimitStatuses = null;

    if (frm.show_assignments) {
        // dynamic import — avoid circular deps with assignments.js
        const asg = await import("./assignments.js");
        await asg.ensureAssignmentsLoaded(frm);
        asg.applyRemainingAssignmentRows(frm);
    }
    return message;
}

export async function loadGridData(frm, periodType) {
    const period_type = periodType || frm._we_period_type || "month";
    const viewLabel = frm.view_options || __(VIEW_OPTION_FORECAST_AND_FACT);

    try {
        const message = await frappe.xcall("project_workload_assignment.api.get_work_efforts_grid", {
            project: frm.doc.name,
            period_type,
            view_options: viewLabel,
            view_mode: normalizeViewMode(viewLabel),
            include_plan: frm.hide_plan ? 0 : 1,
        });
        if (!message) {
            throw new Error("Empty grid response");
        }
        return applyGridResponse(frm, message);
    } catch (err) {
        console.error("[WorkEfforts] grid load failed", err);
        frappe.msgprint(__("Error loading work efforts data"));
        throw err;
    }
}

export async function reloadTable(frm, initTable, refreshRuntime) {
    const state = frm.we;
    if (!state?.container) {
        return null;
    }

    await loadGridData(frm);
    if (state.table) {
        await refreshRuntime(frm);
        return state.table;
    }
    return initTable(frm);
}
