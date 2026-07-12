import { SUMMARY_ROW_ID } from "./constants.js";

function we() {
    return project_workload_assignment.work_efforts;
}

function isBodyRoleRow(row) {
    return !!(row && row.merge_group_id !== SUMMARY_ROW_ID && row.role);
}

function isInPlanDates(row, period) {
    if (!row || row.merge_group_id === SUMMARY_ROW_ID) return false;
    return !!we()?.isPeriodInTaskDates?.(
        period,
        row.custom_planned_start_date,
        row.custom_planned_end_date
    );
}

function isInForecastDates(row, period) {
    if (!row || row.merge_group_id === SUMMARY_ROW_ID) return false;
    return !!we()?.isPeriodInTaskDates?.(period, row.exp_start_date, row.exp_end_date);
}

function hasWorkload(frm, row, period) {
    if (!isBodyRoleRow(row)) return false;
    return !!we()?.hasWorkloadInPeriod?.(frm, row.task_id, row.role, period);
}

/** Ensure workload period map for has-workload markers (reuse legacy). */
export async function ensureWorkloadPeriods(frm) {
    if (!we()?.buildWorkloadPeriodsMap) {
        return;
    }
    if (frm._workloadPeriodsMap && Object.keys(frm._workloadPeriodsMap).length) {
        return;
    }
    await we().buildWorkloadPeriodsMap(frm);
}

export function planPeriodClassRules(frm, period) {
    return {
        "we-v2-in-plan-dates": (params) => isInPlanDates(params.data, period),
    };
}

export function actualPeriodClassRules(frm, period) {
    return {
        "we-v2-in-forecast-dates": (params) => isInForecastDates(params.data, period),
        "we-v2-has-workload": (params) => hasWorkload(frm, params.data, period),
    };
}

export function deltaPeriodClassRules(frm, period) {
    return {
        "we-v2-in-forecast-dates": (params) => isInForecastDates(params.data, period),
    };
}
