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

/** True when row has numeric fact_* hours (ignore fact_utps_* arrays). */
function hasFactOnRow(row) {
    for (const [key, value] of Object.entries(row || {})) {
        if (!key.startsWith("fact_") || key.startsWith("fact_utps")) {
            continue;
        }
        if (Number(value || 0) > 0) {
            return true;
        }
    }
    return false;
}

function rolesOnTask(frm, taskId) {
    const flat = flattenTree(frm.we?.rows || []);
    return flat
        .filter((row) => row.task_id === taskId && !isSummaryRow(row) && !row.we_remaining)
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
    project_workload_assignment.work_efforts?.clear_assignments_cache?.();
    frm._tasksByParent = null;
    project_workload_assignment.work_efforts?.clear_aggregated_tasks?.(frm);
    frm.last_loaded_time = null;
    frm.last_loaded_project = null;
    await window.WorkEfforts.refresh(frm);
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
 * Native fullscreen only paints fullscreenElement subtree — body portals hidden.
 * @returns {HTMLElement}
 */
function getPortalHost() {
    return (
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement ||
        document.body
    );
}

/**
 * Desk-themed dropdown (Bootstrap menu classes), portaled so AG Grid cell
 * overflow does not clip it. Host = fullscreenElement when active, else body.
 * Same visual language as WE «Проверить».
 */
function openAddRoleMenu(frm, taskId, anchorEl, options) {
    closeAddRoleMenu();

    const menu = document.createElement("ul");
    menu.className = "dropdown-menu we-role-add-menu";
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

    getPortalHost().appendChild(menu);
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
    btn.className = "btn btn-default btn-xs we-role-add";
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

function buildDeleteRoleControl(frm, row) {
    const blockedByFact = hasFactOnRow(row);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn-default btn-xs we-role-delete";
    del.textContent = "×";
    del.setAttribute("aria-label", __("Удалить роль"));
    del.addEventListener("mousedown", stopGridEvent);

    if (blockedByFact) {
        del.disabled = true;
        del.title = __("Нельзя удалить роль: по строке есть фактические трудозатраты");
        return del;
    }

    del.title = __("Удалить роль");
    del.addEventListener("click", (e) => {
        e.stopPropagation();
        confirmDeleteRole(frm, row.task_id, row.role);
    });
    return del;
}

/** AG Grid cellRenderer для колонки role. */
export function roleCellRenderer(frm) {
    return function (params) {
        const row = params.data;
        const wrap = document.createElement("div");
        wrap.className = "we-role-cell";

        if (isSummaryRow(row)) {
            return wrap;
        }

        const label = document.createElement("span");
        label.className = "we-role-label";
        // Remaining PWA-only rows: dash in Role (legacy sticky parity)
        label.textContent = row.we_remaining || !row.role ? "—" : __(row.role);
        wrap.appendChild(label);

        const actions = document.createElement("div");
        actions.className = "we-role-actions";

        if (row.role && !row.we_remaining) {
            actions.appendChild(buildDeleteRoleControl(frm, row));
        }

        // "+" — merge head only (summary already returned above); not on remaining
        if (row.merge_group_index === 0 && !row.we_remaining) {
            const add = buildAddRoleControl(frm, row.task_id);
            if (add) {
                actions.appendChild(add);
            }
        }

        if (actions.childNodes.length) {
            wrap.appendChild(actions);
        }

        return wrap;
    };
}
