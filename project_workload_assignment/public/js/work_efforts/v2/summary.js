import { SUMMARY_ROW_ID } from "./constants.js";

function calcDeltaPct(plan, actual) {
	return plan ? Math.round(((actual - plan) / plan) * 1000) / 10 : 0;
}

export function buildSummaryRows(frm, periods, apiSummaryRows) {
    if (apiSummaryRows?.length) return apiSummaryRows;
    if (!frm.aggregatedTasks || !Object.keys(frm.aggregatedTasks).length) return [];

    const legacy = project_workload_assignment.work_efforts;
    const allRoles = legacy.get_project_roles(frm).filter((r) => r);
    if (!allRoles.length) return [];

    const row = {
        id: SUMMARY_ROW_ID,
        task_id: SUMMARY_ROW_ID,
        task_subject: __("Итого"),
        role: null,
        parent_task_id: null,
        merge_group_id: SUMMARY_ROW_ID,
        merge_group_index: 0,
        merge_group_size: 1,
        has_children: false,
    };

    for (const period of periods || []) {
        const totals = legacy.calc_we_column_total_optimized(
            frm,
            allRoles,
            { year: period.year, month: period.month, is_past: period.is_past },
            !frm.hide_plan
        );
        const plan = totals.plan;
        const actual = totals.actual;
        row[`plan_${period.key}`] = plan;
        row[`actual_${period.key}`] = actual;
        row[`delta_${period.key}`] = calcDeltaPct(plan, actual);
    }

    return [row];
}

export function syncExpandedIds(frm) {
    const table = frm.we_v2?.table;
    if (!table?.expandedIds) return;
    frm._we_v2_expanded_ids = [...table.expandedIds];
    if (frm.we_v2) {
        frm.we_v2.expandedIds = frm._we_v2_expanded_ids;
    }
}

export function attachTreePersistence(frm, table) {
    if (!table || table._treePersistence) return;

    const wrap = (methodName, isAsync = false) => {
        const original = table[methodName]?.bind(table);
        if (!original) return;
        if (isAsync) {
            table[methodName] = async (...args) => {
                const result = await original(...args);
                syncExpandedIds(frm);
                return result;
            };
            return;
        }
        table[methodName] = (...args) => {
            const result = original(...args);
            syncExpandedIds(frm);
            return result;
        };
    };

    wrap("toggleRow");
    wrap("expandRow", true);
    wrap("collapseRow");
    table._treePersistence = true;
}

export function getExpandedIds(frm) {
    return frm._we_v2_expanded_ids || frm.we_v2?.expandedIds || [];
}
