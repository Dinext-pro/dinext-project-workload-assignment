import { SUMMARY_ROW_ID } from "./constants.js";

function normalizeRole(str) {
    return str ? String(str).trim() : "";
}

function getAvatarGroupEl(users, limit = 3) {
    if (!users?.length || typeof frappe.avatar_group !== "function") {
        return null;
    }
    try {
        const emails = users.map((u) => u.user).filter(Boolean);
        if (!emails.length) return null;
        const group = frappe.avatar_group(emails, limit, { filterable: false });
        return group?.[0] || null;
    } catch (err) {
        console.error("[WorkEfforts] avatar_group failed", err);
        return null;
    }
}

export function getRoleAssignments(taskId, role) {
    const we = project_workload_assignment.work_efforts;
    const all = we?.get_task_assignments?.(taskId) || [];
    const want = normalizeRole(role);
    return all.filter((a) => normalizeRole(a.role) === want);
}

export async function ensureAssignmentsLoaded(frm) {
    const we = project_workload_assignment.work_efforts;
    if (!we?.load_all_assignments_if_needed) {
        return;
    }
    const taskIds = we.get_assignment_task_ids?.(frm) || [];
    if (!taskIds.length) {
        return;
    }
    await we.load_all_assignments_if_needed(frm);
}

function resolveTaskSubject(frm, row) {
    if (row?.task_subject) return row.task_subject;
    const flat = project_workload_assignment.work_efforts.flattenWeRows?.(frm.we?.rows, []) || [];
    const head = flat.find((r) => r.task_id === row?.task_id && r.merge_group_index === 0);
    return head?.task_subject || "";
}

function openPwaDialog(frm, row) {
    if (typeof start_pwa_dialog !== "function") {
        frappe.msgprint(__("Workload assignment function is unavailable"));
        return;
    }

    const task = {
        name: row.task_id,
        project: frm.doc.name,
        subject: resolveTaskSubject(frm, row),
        exp_start_date: row.exp_start_date,
        exp_end_date: row.exp_end_date,
    };

    start_pwa_dialog(async () => {
        const we = project_workload_assignment.work_efforts;
        we?.clear_assignments_cache?.();
        await ensureAssignmentsLoaded(frm);
        we?.updateTable?.(frm, "month", "hours");
        refreshAssignmentsCells(frm);
        frappe.show_alert({ message: __("Assignments updated"), indicator: "green" }, 3);
    }, task);
}

export function refreshAssignmentsCells(frm) {
    const api = frm.we?.table?.api;
    if (!api?.refreshCells) return;
    api.refreshCells({ columns: ["assignments"], force: true });
}

/** Toggle колонки «Назначения» (фаза 13). */
export async function onAssignmentsToggle(frm) {
    const state = frm.we;
    const show = !!frm.show_assignments;

    if (show) {
        await ensureAssignmentsLoaded(frm);
    }

    const api = state?.table?.api;
    if (!api || typeof api.setColumnsVisible !== "function") {
        return;
    }

    api.setColumnsVisible(["assignments"], show);
    for (const col of state.table.columns || []) {
        if ((col.colId || col.field) === "assignments") {
            col.hide = !show;
        }
    }
    if (show) {
        refreshAssignmentsCells(frm);
    }
}

export function assignmentsCellRenderer(frm) {
    return function (params) {
        const row = params.data;
        const wrap = document.createElement("div");
        wrap.className = "we-assignments-cell";

        if (!row || row.merge_group_id === SUMMARY_ROW_ID) {
            return wrap;
        }

        const users = getRoleAssignments(row.task_id, row.role);
        const avatarEl = getAvatarGroupEl(users, 3);
        if (avatarEl) {
            const group = document.createElement("div");
            group.className = "we-assignment-avatars";
            group.appendChild(avatarEl);
            wrap.appendChild(group);
        }

        wrap.addEventListener("click", (e) => {
            e.stopPropagation();
            openPwaDialog(frm, row);
        });

        return wrap;
    };
}
