import { SUMMARY_ROW_ID } from "./constants.js";

function limitKey(row, period) {
    return `${row.task_id}_${row.role || ""}_${period.year}_${period.month}`;
}

/** cellClassRules для actual_{key}: UTP limit status (только past).
 * Parity legacy we-table.css: только normal / warning / block имеют визуал.
 * message / no-plan в legacy класс ставят, но CSS для них нет — не красим.
 */
export function limitStatusCellClassRules(frm, period) {
    if (!period.is_past) {
        return {};
    }

    return {
        "we-v2-limit-normal": (params) => getLimitStatus(frm, params.data, period) === "normal",
        "we-v2-limit-warning": (params) => getLimitStatus(frm, params.data, period) === "warning",
        "we-v2-limit-block": (params) => getLimitStatus(frm, params.data, period) === "block",
    };
}

function getLimitStatus(frm, row, period) {
    if (!row || row.merge_group_id === SUMMARY_ROW_ID) return null;
    return frm.periodLimitStatuses?.[limitKey(row, period)]?.status || null;
}

export function actualCellClassRules(frm, period) {
    return limitStatusCellClassRules(frm, period);
}

/**
 * Гарантирует frm.periodLimitStatuses (shared recalculatePeriodLimits).
 * Источник фактов — we_v2.rows (или aggregatedTasks fallback внутри).
 */
export function ensurePeriodLimits(frm) {
    return new Promise((resolve) => {
        const legacy = project_workload_assignment.work_efforts;
        if (!legacy?.recalculatePeriodLimits) {
            resolve(frm.periodLimitStatuses || {});
            return;
        }
        if (frm.periodLimitStatuses && Object.keys(frm.periodLimitStatuses).length) {
            resolve(frm.periodLimitStatuses);
            return;
        }
        const hasV2 = !!(frm.we_v2?.rows && frm.we_v2.rows.length);
        const hasAgg = !!(frm.aggregatedTasks && Object.keys(frm.aggregatedTasks).length);
        if (!hasV2 && !hasAgg) {
            frm.periodLimitStatuses = frm.periodLimitStatuses || {};
            resolve(frm.periodLimitStatuses);
            return;
        }
        legacy.recalculatePeriodLimits(frm, frm._we_period_type || "month", () => {
            resolve(frm.periodLimitStatuses || {});
        });
    });
}

/** После смены лимитов на форме — перерисовать cell classes. */
export function refreshLimitHighlight(frm) {
    const table = frm.we_v2?.table;
    if (!table?.api?.refreshCells) return;
    table.api.refreshCells({ force: true });
}
