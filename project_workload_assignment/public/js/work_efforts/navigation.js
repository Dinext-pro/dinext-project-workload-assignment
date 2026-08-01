/**
 * Фаза 15.3 — dblclick past fact → List User Timesheet Position.
 */

import { isSummaryRow } from "./constants.js";

function resolveUtps(row, periodKey) {
    const fromRow = row[`fact_utps_${periodKey}`];
    return Array.isArray(fromRow) ? fromRow : [];
}

export function onCellDoubleClicked(frm, params) {
    const field = params?.colDef?.field || params?.column?.getColDef?.()?.field || "";
    const match = /^actual_(.+)$/.exec(field);
    if (!match) return;

    const periodKey = match[1];
    const row = params.data;
    if (isSummaryRow(row)) return;

    const period = (frm.we?.periods || []).find((p) => p.key === periodKey);
    if (!period?.is_past) return;

    const value = Number(row[`actual_${periodKey}`] || row[`fact_${periodKey}`] || 0);
    if (!value) return;

    const utps = resolveUtps(row, periodKey);
    if (!utps.length) {
        frappe.show_alert(__("No related User Timesheet Position"), 3);
        return;
    }

    frappe.route_options = { name: ["in", utps] };
    frappe.set_route("List", "User Timesheet Position");
}

/** Sync P&L after WE data ready. */
export function syncPlFromWe(frm) {
    project_workload_assignment.work_efforts?.syncPlTaskDimensionFromWe?.(frm);
}
