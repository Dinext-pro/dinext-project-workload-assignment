/**
 * dblclick past fact → List User Timesheet Position (legacy sticky parity).
 */

import { isSummaryRow } from "./constants.js";

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

function resolveUtps(row, periodKey) {
    const fromRow = row[`fact_utps_${periodKey}`];
    return Array.isArray(fromRow) ? fromRow : [];
}

function collectSummaryUtps(frm, periodKey) {
    const utps = [];
    for (const row of flattenTree(frm.we?.rows || [])) {
        if (isSummaryRow(row) || row.we_remaining) continue;
        utps.push(...resolveUtps(row, periodKey));
    }
    return [...new Set(utps)];
}

function openUtps(utps) {
    if (!utps.length) {
        frappe.show_alert(__("No associated User Timesheet Positions"), 3);
        return;
    }
    frappe.route_options = { name: ["in", utps] };
    frappe.set_route("List", "User Timesheet Position");
}

export function onCellDoubleClicked(frm, params) {
    const field = params?.colDef?.field || params?.column?.getColDef?.()?.field || "";
    const match = /^actual_(.+)$/.exec(field);
    if (!match) return;

    const periodKey = match[1];
    const row = params.data;
    const period = (frm.we?.periods || []).find((p) => p.key === periodKey);
    if (!period?.is_past) return;

    // Legacy: summary / total group — all UTPs for the period across tasks/roles
    if (isSummaryRow(row)) {
        const value = Number(row[`actual_${periodKey}`] || row[`fact_${periodKey}`] || 0);
        if (!value) return;
        openUtps(collectSummaryUtps(frm, periodKey));
        return;
    }

    if (row?.we_remaining) return;

    const value = Number(row[`actual_${periodKey}`] || row[`fact_${periodKey}`] || 0);
    if (!value) return;

    openUtps(resolveUtps(row, periodKey));
}

/** Sync P&L after WE data ready. */
export function syncPlFromWe(frm) {
    project_workload_assignment.work_efforts?.syncPlTaskDimensionFromWe?.(frm);
}
