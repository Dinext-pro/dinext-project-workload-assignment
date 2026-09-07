import { ROW_ID_SEP, SUMMARY_ROW_ID } from "./constants.js";

function normalizeRole(str) {
    return str ? String(str).trim() : "";
}

/** Match legacy sticky: empty PWA role → «Без роли» bucket. */
function assignmentRoleKey(str) {
    return normalizeRole(str) || "Без роли";
}

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
    const want = assignmentRoleKey(role);
    return all.filter((a) => assignmentRoleKey(a.role) === want);
}

/** DinextTable column filter reads row.assignments (renderer ignores it). */
export function buildRoleAssignmentsSearchText(taskId, role) {
    const users = getRoleAssignments(taskId, role);
    if (!users.length) {
        return "";
    }
    const parts = [];
    for (const a of users) {
        const name = a.user_full_name ? String(a.user_full_name).trim() : "";
        const email = a.user ? String(a.user).trim() : "";
        if (name) {
            parts.push(name);
        }
        if (email && email !== name) {
            parts.push(email);
        }
    }
    return parts.join(" ");
}

function walkAssignmentRows(rows, fn) {
    for (const row of rows || []) {
        fn(row);
        if (row.children?.length) {
            walkAssignmentRows(row.children, fn);
        }
    }
}

export function applyAssignmentsSearchFields(frm) {
    const rows = frm.we?.rows;
    if (!rows?.length) {
        return;
    }
    walkAssignmentRows(rows, (row) => {
        if (row.merge_group_id === SUMMARY_ROW_ID) {
            return;
        }
        row.assignments = buildRoleAssignmentsSearchText(row.task_id, row.role);
    });
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
    applyAssignmentsSearchFields(frm);
}

function resolveTaskSubject(frm, row) {
    if (row?.task_subject) return row.task_subject;
    const flat = flattenTree(frm.we?.rows || []);
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
        // Full refresh rebuilds rows; remaining re-injected when show_assignments
        if (window.WorkEfforts?.refresh) {
            await window.WorkEfforts.refresh(frm);
        } else {
            await ensureAssignmentsLoaded(frm);
            we?.updateTable?.(frm, "month", "hours");
            refreshAssignmentsCells(frm);
        }
        frappe.show_alert({ message: __("Assignments updated"), indicator: "green" }, 3);
    }, task);
}

export function refreshAssignmentsCells(frm) {
    applyAssignmentsSearchFields(frm);
    const api = frm.we?.table?.api;
    if (!api?.refreshCells) return;
    api.refreshCells({ columns: ["assignments"], force: true });
}

function remainingRolesForTask(frm, taskId, weRoles) {
    const we = project_workload_assignment.work_efforts;
    const assignments = we?.get_task_assignments?.(taskId) || [];
    const weKeys = new Set([...weRoles].map(assignmentRoleKey));
    const remaining = new Set();
    for (const a of assignments) {
        const role = assignmentRoleKey(a.role);
        if (!weKeys.has(role)) {
            remaining.add(role);
        }
    }
    return [...remaining].sort((a, b) => a.localeCompare(b));
}

function makeRemainingRow(head, role, index, size) {
    const roleKey = role || "_";
    return {
        id: `${head.task_id}${ROW_ID_SEP}remaining${ROW_ID_SEP}${roleKey}`,
        task_id: head.task_id,
        task_subject: "",
        role,
        we_remaining: true,
        parent_task_id: head.parent_task_id || null,
        merge_group_id: head.merge_group_id,
        merge_group_index: index,
        merge_group_size: size,
        has_children: false,
        exp_start_date: head.exp_start_date || null,
        exp_end_date: head.exp_end_date || null,
        custom_planned_start_date: head.custom_planned_start_date || null,
        custom_planned_end_date: head.custom_planned_end_date || null,
        act_start_date: head.act_start_date || null,
        act_end_date: head.act_end_date || null,
        assignments: "",
    };
}

function reindexGroup(group) {
    const size = group.length;
    for (let i = 0; i < size; i++) {
        group[i].merge_group_index = i;
        group[i].merge_group_size = size;
    }
}

/**
 * Legacy remainingRoles: PWA roles without a WE role row → synthetic rows (Role «—»).
 * Mutates frm.we.rows in place (tree).
 */
export function applyRemainingAssignmentRows(frm) {
    const state = frm.we;
    if (!state?.rows?.length || !frm.show_assignments) {
        return;
    }

    function processLevel(rows) {
        const result = [];
        let i = 0;
        while (i < rows.length) {
            const head = rows[i];
            const groupId = head.merge_group_id;
            const group = [];
            while (i < rows.length && rows[i].merge_group_id === groupId) {
                // Drop previous synthetic rows when re-applying
                if (!rows[i].we_remaining) {
                    group.push(rows[i]);
                }
                i++;
            }

            if (group[0]?.children?.length) {
                group[0].children = processLevel(group[0].children);
            }

            if (group[0] && group[0].merge_group_id !== SUMMARY_ROW_ID) {
                const weRoles = new Set(
                    group.map((r) => normalizeRole(r.role))
                );
                const remaining = remainingRolesForTask(frm, group[0].task_id, weRoles);
                for (const role of remaining) {
                    group.push(makeRemainingRow(group[0], role, group.length, group.length + 1));
                }
                reindexGroup(group);
            }

            result.push(...group);
        }
        return result;
    }

    state.rows = processLevel(state.rows);
    applyAssignmentsSearchFields(frm);
}

/** Toggle колонки «Назначения» + remaining rows (фаза 13 / legacy remainingRoles). */
export async function onAssignmentsToggle(frm) {
    const state = frm.we;
    const show = !!frm.show_assignments;
    const { rebuildRowsFromApi } = await import("./data.js");

    if (show) {
        await ensureAssignmentsLoaded(frm);
        rebuildRowsFromApi(frm);
        applyRemainingAssignmentRows(frm);
    } else if (state?.flatApiRows) {
        rebuildRowsFromApi(frm);
    }

    const api = state?.table?.api;
    if (state?.table?.refresh) {
        state.table.refresh(state.rows);
    }
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
