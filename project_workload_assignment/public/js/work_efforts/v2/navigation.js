/**
 * Фаза 15.3 — dblclick past fact → List User Timesheet Position.
 */

function resolveUtps(frm, row, periodKey) {
    const fromRow = row[`fact_utps_${periodKey}`];
    if (Array.isArray(fromRow) && fromRow.length) {
        return fromRow;
    }

    const roleEntry = (frm.aggregatedTasks?.[row.task_id]?.role_data || []).find(
        (r) => (r.role || "") === (row.role || "")
    );
    const fromLegacy = roleEntry?.[`fact_utps_${periodKey}`];
    return Array.isArray(fromLegacy) ? fromLegacy : [];
}

export function onCellDoubleClicked(frm, params) {
    // DinextTable: onCellDoubleClicked(params, table) — table unused
    const field = params?.colDef?.field || params?.column?.getColDef?.()?.field || "";
    const match = /^actual_(.+)$/.exec(field);
    if (!match) return;

    const periodKey = match[1];
    const row = params.data;
    if (!row || row.merge_group_id === "summary-total") return;

    const period = (frm.we_v2?.periods || []).find((p) => p.key === periodKey);
    if (!period?.is_past) return;

    const value = Number(row[`actual_${periodKey}`] || row[`fact_${periodKey}`] || 0);
    if (!value) return;

    const utps = resolveUtps(frm, row, periodKey);
    if (!utps.length) {
        frappe.show_alert(__("Нет связанных User Timesheet Position"), 3);
        return;
    }

    frappe.route_options = { name: ["in", utps] };
    frappe.set_route("List", "User Timesheet Position");
}

/** Dual-table: sync P&L task dimension after WE data ready. */
export function syncPlFromWe(frm) {
    project_workload_assignment.work_efforts?.syncPlTaskDimensionFromWe?.(frm);
}
