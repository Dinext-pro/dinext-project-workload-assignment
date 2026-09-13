import { PERIOD_FIELD_RE, SUMMARY_ROW_ID } from "./constants.js";

function flattenTree(rows) {
    const result = [];
    for (const row of rows || []) {
        result.push(row);
        if (row.children?.length) {
            result.push(...flattenTree(row.children));
        }
    }
    return result;
}

export function getSelectedTaskIds(frm) {
    const table = frm.we?.table;
    if (!table?.getCheckedRows) {
        return [];
    }

    const taskIds = [];
    const seen = new Set();

    for (const row of table.getCheckedRows()) {
        if (!row || row.merge_group_id === SUMMARY_ROW_ID) continue;
        // mergeHead unit: only heads land in Set; keep guard for safety.
        if (row.merge_group_index != null && row.merge_group_index !== 0) continue;
        const taskId = row.task_id;
        if (!taskId || seen.has(taskId)) continue;
        seen.add(taskId);
        taskIds.push(taskId);
    }

    return taskIds;
}

/** Period key from field like plan_2026_01 / actual_2026_01; null for non-period cols. */
function periodKeyFromField(field) {
    if (!field || !PERIOD_FIELD_RE.test(field)) {
        return null;
    }
    return field.replace(PERIOD_FIELD_RE, "");
}

function targetDedupeKey(taskId, role, periodKey) {
    return `${taskId}\0${role || ""}\0${periodKey}`;
}

/**
 * Period cells inside current cell ranges → { row, period }[].
 * Uses DinextTable getCellRanges + api (same geometry as status bar).
 */
function getSelectedPeriodCellTargets(frm) {
    const table = frm.we?.table;
    const api = table?.api;
    if (!table?.getCellRanges || !api?.getAllDisplayedColumns) {
        return [];
    }

    const ranges = table.getCellRanges();
    if (!ranges?.length) {
        return [];
    }

    const periodByKey = new Map((frm.we?.periods || []).map((p) => [p.key, p]));
    if (!periodByKey.size) {
        return [];
    }

    const columns = api.getAllDisplayedColumns();
    const targets = [];
    const seen = new Set();

    for (const range of ranges) {
        const bounds = table.buildRangeBounds?.(range, columns);
        if (!bounds) {
            continue;
        }

        for (let rowIndex = bounds.minRowIndex; rowIndex <= bounds.maxRowIndex; rowIndex += 1) {
            const rowNode = api.getDisplayedRowAtIndex(rowIndex);
            const row = rowNode?.data;
            if (!row?.task_id || row.merge_group_id === SUMMARY_ROW_ID) {
                continue;
            }
            if (table.shouldApplySelectionToRow && !table.shouldApplySelectionToRow(rowNode)) {
                continue;
            }

            for (let colIndex = bounds.minColIndex; colIndex <= bounds.maxColIndex; colIndex += 1) {
                if (table.getCellRangeState && !table.getCellRangeState(rowIndex, colIndex).inRange) {
                    continue;
                }

                const field = columns[colIndex]?.getColDef()?.field;
                const periodKey = periodKeyFromField(field);
                if (!periodKey || !periodByKey.has(periodKey)) {
                    continue;
                }

                const dedupe = targetDedupeKey(row.task_id, row.role, periodKey);
                if (seen.has(dedupe)) {
                    continue;
                }
                seen.add(dedupe);
                targets.push({ row, period: periodByKey.get(periodKey) });
            }
        }
    }

    return targets;
}

function tryAddPlanEntry(data, seen, row, period) {
    if (!row?.task_id || !period?.key || row.merge_group_id === SUMMARY_ROW_ID) {
        return;
    }

    const key = period.key;
    const dedupe = targetDedupeKey(row.task_id, row.role, key);
    if (seen.has(dedupe)) {
        return;
    }
    seen.add(dedupe);

    const currentPlan = Number(row[`plan_${key}`] || 0);
    const newPlanValue = period.is_past
        ? Number(row[`fact_${key}`] || 0)
        : Number(row[`forecast_${key}`] || 0);

    if (newPlanValue !== currentPlan && (newPlanValue > 0 || currentPlan > 0)) {
        data.push({
            task: row.task_id,
            role: row.role || "",
            year: period.year,
            month: period.month,
            plan_value: newPlanValue,
            current_plan: currentPlan,
        });
    }
}

/** True when row checkboxes and/or period cell ranges provide save-plan targets. */
export function hasSavePlanSelection(frm) {
    return getSelectedTaskIds(frm).length > 0 || getSelectedPeriodCellTargets(frm).length > 0;
}

/**
 * Union: checked tasks × all periods + selected period cells.
 * Dedupe by task+role+year+month.
 */
export function buildSavePlanPayload(frm) {
    const periods = frm.we?.periods || [];
    const flat = flattenTree(frm.we?.rows || []);
    const selectedIds = new Set(getSelectedTaskIds(frm));
    const cellTargets = getSelectedPeriodCellTargets(frm);
    const data = [];
    const seen = new Set();

    if (selectedIds.size) {
        for (const row of flat) {
            if (!selectedIds.has(row.task_id)) continue;
            if (row.merge_group_id === SUMMARY_ROW_ID) continue;
            for (const period of periods) {
                tryAddPlanEntry(data, seen, row, period);
            }
        }
    }

    for (const { row, period } of cellTargets) {
        tryAddPlanEntry(data, seen, row, period);
    }

    return data;
}

async function postSaveRefresh(frm) {
    frappe.show_alert(__("Data saved as plan successfully"), 5);

    if (project_workload_assignment.work_efforts?.clear_assignments_cache) {
        project_workload_assignment.work_efforts.clear_assignments_cache();
    }

    frm.last_loaded_time = null;
    frm.last_loaded_project = null;

    project_workload_assignment.work_efforts?.clear_aggregated_tasks?.(frm);

    frm._missingPlanMap = {};
    frm._missingPlanPeriodsMap = {};

    frm.we_progress = null;
    frm._we_progress_inflight = null;
    if (typeof load_and_render_project_dashboard === "function") {
        load_and_render_project_dashboard(frm);
    }

    if (window.WorkEfforts?.refresh) {
        await window.WorkEfforts.refresh(frm);
    }
}

async function executeSaveForecastAsPlan(frm, data) {
    const res = await frappe.xcall("project_workload_assignment.api.save_forecast_as_plan", {
        project: frm.doc.name,
        data: JSON.stringify(data),
    });

    if (res?.exc) {
        throw new Error(res.exc);
    }

    await postSaveRefresh(frm);
}

export function saveForecastAsPlan(frm) {
    if (!hasSavePlanSelection(frm)) {
        frappe.msgprint(
            __("Select tasks and/or period cells for which plan data should be saved.")
        );
        return;
    }

    const data = buildSavePlanPayload(frm);
    if (!data.length) {
        frappe.msgprint(__("No changes to save."));
        return;
    }

    frappe.confirm(
        __("Are you sure you want to save the selected forecast / actual data as plan (checked rows and selected cells)?"),
        () => {
            executeSaveForecastAsPlan(frm, data).catch((err) => {
                frappe.msgprint(__("Error saving plan"));
                console.error(err);
            });
        },
        () => {
            frappe.show_alert(__("Operation cancelled"), 3);
        }
    );
}
