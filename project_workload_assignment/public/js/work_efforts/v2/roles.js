import { SUMMARY_ROW_ID } from "./constants.js";

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

function hasFactOnRow(row, periods) {
    for (const period of periods || []) {
        if (Number(row[`fact_${period.key}`] || 0) > 0) {
            return true;
        }
    }
    for (const key of Object.keys(row || {})) {
        if (key.startsWith("fact_") && Number(row[key] || 0) > 0) {
            return true;
        }
    }
    return false;
}

function rolesOnTask(frm, taskId) {
    const flat = flattenTree(frm.we_v2?.rows || []);
    return flat
        .filter((row) => row.task_id === taskId && row.merge_group_id !== SUMMARY_ROW_ID)
        .map((row) => row.role)
        .filter(Boolean);
}

function availableRolesForTask(frm, taskId) {
    const allRoles = (project_workload_assignment.work_efforts?.get_project_roles?.(frm) || []).filter(
        Boolean
    );
    const existing = new Set(rolesOnTask(frm, taskId));
    return allRoles.filter((role) => !existing.has(role));
}

async function postRoleMutationRefresh(frm) {
    if (project_workload_assignment.work_efforts?.clear_assignments_cache) {
        project_workload_assignment.work_efforts.clear_assignments_cache();
    }
    if (frm._tasksByParent) {
        frm._tasksByParent = null;
    }
    if (project_workload_assignment.work_efforts?.clearTaskIndexCacheFor) {
        project_workload_assignment.work_efforts.clearTaskIndexCacheFor(frm.aggregatedTasks);
    }

    frm.last_loaded_time = null;
    frm.last_loaded_project = null;

    if (project_workload_assignment.work_efforts?.load_work_efforts_data) {
        project_workload_assignment.work_efforts.load_work_efforts_data(
            frm,
            frm._we_period_type || "month",
            "hours",
            true
        );
    } else if (project_workload_assignment.work_efforts?.updateTable) {
        project_workload_assignment.work_efforts.updateTable(frm, "month", "hours");
    }

    if (window.WorkEffortsV2?.refresh) {
        await window.WorkEffortsV2.refresh(frm);
    }
}

export async function addRole(frm, taskId, role) {
    if (!frm?.doc?.name || !taskId || !role) {
        return;
    }

    const existing = await frappe.db.get_list("Project Work Efforts", {
        filters: {
            pwe_project: frm.doc.name,
            pwe_task: taskId,
            pwe_project_role: role,
        },
        fields: ["name"],
        limit: 1,
    });

    if (!existing?.length) {
        await frappe.db.insert({
            doctype: "Project Work Efforts",
            pwe_project: frm.doc.name,
            pwe_task: taskId,
            pwe_project_role: role,
        });
    }

    const taskData = frm.aggregatedTasks?.[taskId];
    if (taskData) {
        if (!taskData.role_data) taskData.role_data = [];
        if (!taskData.role_data.some((r) => r?.role === role)) {
            taskData.role_data.push({ role });
        }
    }

    frappe.show_alert({ message: __("Роль {0} добавлена", [role]), indicator: "green" }, 3);
    await postRoleMutationRefresh(frm);
}

export async function deleteRole(frm, taskId, role) {
    if (!frm?.doc?.name || !taskId || !role) {
        return;
    }

    const docs = await frappe.db.get_list("Project Work Efforts", {
        filters: {
            pwe_project: frm.doc.name,
            pwe_task: taskId,
            pwe_project_role: role,
        },
        fields: ["name"],
        limit: 10,
    });

    if (docs?.length) {
        await Promise.all(
            docs.map((doc) =>
                frappe.call({
                    method: "frappe.client.delete",
                    args: { doctype: "Project Work Efforts", name: doc.name },
                })
            )
        );
    }

    const taskData = frm.aggregatedTasks?.[taskId];
    if (taskData?.role_data) {
        taskData.role_data = taskData.role_data.filter((r) => r.role !== role);
    }

    frappe.show_alert({ message: __("Роль удалена"), indicator: "green" }, 3);
    await postRoleMutationRefresh(frm);
}

export function confirmDeleteRole(frm, taskId, role) {
    frappe.confirm(__("Вы действительно хотите удалить роль {0} для задачи {1}?", [role, taskId]), () => {
        deleteRole(frm, taskId, role).catch((err) => {
            console.error(err);
            frappe.msgprint(__("Ошибка при удалении роли"));
        });
    });
}

function stopGridEvent(e) {
    e.stopPropagation();
}

let openRoleMenuEl = null;
let openRoleMenuCloser = null;

function closeAddRoleMenu() {
    if (openRoleMenuCloser) {
        document.removeEventListener("mousedown", openRoleMenuCloser, true);
        openRoleMenuCloser = null;
    }
    if (openRoleMenuEl) {
        openRoleMenuEl.remove();
        openRoleMenuEl = null;
    }
}

/**
 * Desk-themed dropdown (Bootstrap menu classes), portaled to body so AG Grid
 * cell overflow does not clip it. Same visual language as WE «Проверить».
 */
function openAddRoleMenu(frm, taskId, anchorEl, options) {
    closeAddRoleMenu();

    const menu = document.createElement("ul");
    menu.className = "dropdown-menu we-v2-role-add-menu";
    menu.setAttribute("role", "menu");
    menu.style.display = "block";
    menu.style.position = "fixed";
    menu.style.zIndex = "1050";

    for (const role of options) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = "#";
        a.setAttribute("role", "menuitem");
        a.textContent = __(role);
        a.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeAddRoleMenu();
            addRole(frm, taskId, role).catch((err) => {
                console.error(err);
                frappe.msgprint(__("Ошибка при добавлении роли"));
            });
        });
        li.appendChild(a);
        menu.appendChild(li);
    }

    document.body.appendChild(menu);
    const rect = anchorEl.getBoundingClientRect();
    const menuWidth = menu.offsetWidth || 160;
    let left = rect.right - menuWidth;
    if (left < 8) left = 8;
    menu.style.left = `${left}px`;
    menu.style.top = `${rect.bottom + 2}px`;

    openRoleMenuEl = menu;
    openRoleMenuCloser = (event) => {
        if (menu.contains(event.target) || anchorEl.contains(event.target)) {
            return;
        }
        closeAddRoleMenu();
    };
    // next tick — avoid closing from the same click that opened
    setTimeout(() => {
        document.addEventListener("mousedown", openRoleMenuCloser, true);
    }, 0);
}

function buildAddRoleControl(frm, taskId) {
    const options = availableRolesForTask(frm, taskId);
    if (!options.length) {
        return null;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-default btn-xs we-v2-role-add";
    btn.title = __("Добавить роль");
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-label", __("Добавить роль"));
    btn.textContent = "+";

    btn.addEventListener("mousedown", stopGridEvent);
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (openRoleMenuEl) {
            closeAddRoleMenu();
            return;
        }
        openAddRoleMenu(frm, taskId, btn, options);
    });

    return btn;
}

/** AG Grid cellRenderer для колонки role. */
export function roleCellRenderer(frm) {
    return function (params) {
        const row = params.data;
        const wrap = document.createElement("div");
        wrap.className = "we-v2-role-cell";

        if (!row || row.merge_group_id === SUMMARY_ROW_ID) {
            return wrap;
        }

        const label = document.createElement("span");
        label.className = "we-v2-role-label";
        label.textContent = row.role ? __(row.role) : "—";
        wrap.appendChild(label);

        const periods = frm.we_v2?.periods || [];
        if (row.role && !hasFactOnRow(row, periods)) {
            const del = document.createElement("button");
            del.type = "button";
            del.className = "btn btn-default btn-xs we-v2-role-delete";
            del.title = __("Удалить роль");
            del.textContent = "×";
            del.addEventListener("mousedown", stopGridEvent);
            del.addEventListener("click", (e) => {
                e.stopPropagation();
                confirmDeleteRole(frm, row.task_id, row.role);
            });
            wrap.appendChild(del);
        }

        // "+" opens native role dropdown (merge head only)
        if (row.merge_group_index === 0) {
            const add = buildAddRoleControl(frm, row.task_id);
            if (add) {
                wrap.appendChild(add);
            }
        }

        return wrap;
    };
}
