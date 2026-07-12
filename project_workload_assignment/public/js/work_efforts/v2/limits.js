import { SUMMARY_ROW_ID } from "./constants.js";

function limitKey(row, period) {
    return `${row.task_id}_${row.role || ""}_${period.year}_${period.month}`;
}

/** cellClassRules для actual_{key}: UTP limit status (только past). */
export function limitStatusCellClassRules(frm, period) {
    if (!period.is_past) {
        return {};
    }

    // normal не стилизуем — иначе inset-обводка почти на всех past-ячейках
    return {
        "we-v2-limit-warning": (params) => getLimitStatus(frm, params.data, period) === "warning",
        "we-v2-limit-block": (params) => getLimitStatus(frm, params.data, period) === "block",
        "we-v2-limit-message": (params) => getLimitStatus(frm, params.data, period) === "message",
        "we-v2-limit-no-plan": (params) => getLimitStatus(frm, params.data, period) === "no-plan",
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
 * Гарантирует frm.periodLimitStatuses (reuse legacy recalculatePeriodLimits).
 * Dual-table: если legacy уже посчитал — skip.
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
        if (!frm.aggregatedTasks || !Object.keys(frm.aggregatedTasks).length) {
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
