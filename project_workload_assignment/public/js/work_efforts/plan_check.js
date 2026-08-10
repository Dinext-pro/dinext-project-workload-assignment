import { ROW_ID_SEP, SUMMARY_ROW_ID } from "./constants.js";

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

function headRowId(taskId, role) {
    return `${taskId}${ROW_ID_SEP}${role || ""}`;
}

function headRowsByTask(frm) {
    const headByTask = new Map();
    for (const row of flattenTree(frm.we?.rows || [])) {
        if (row.merge_group_index === 0 && row.merge_group_id !== SUMMARY_ROW_ID) {
            headByTask.set(row.task_id, row);
        }
    }
    return headByTask;
}

function roleRowsByTask(frm) {
    /** @type {Map<string, Map<string, object>>} */
    const byTask = new Map();
    for (const row of flattenTree(frm.we?.rows || [])) {
        if (!row?.task_id || row.merge_group_id === SUMMARY_ROW_ID) continue;
        if (!byTask.has(row.task_id)) {
            byTask.set(row.task_id, new Map());
        }
        byTask.get(row.task_id).set(row.role || "", row);
    }
    return byTask;
}

/**
 * Expand ancestors of tasks with missing plan; collapse other parents.
 */
export async function expandParents(frm, missingPlanMap) {
    const table = frm.we?.table;
    if (!table?.expandRow) return;

    const headByTask = headRowsByTask(frm);

    const parentsToExpand = new Set();
    for (const taskId of Object.keys(missingPlanMap || {})) {
        let current = headByTask.get(taskId);
        while (current?.parent_task_id) {
            parentsToExpand.add(current.parent_task_id);
            current = headByTask.get(current.parent_task_id);
        }
    }

    const allParents = [];
    for (const [taskId, row] of headByTask) {
        const hasChildren = !!row.children?.length || !!row.has_children;
        if (hasChildren) {
            allParents.push({ taskId, rowId: row.id || headRowId(taskId, row.role) });
        }
    }

    for (const { taskId, rowId } of allParents) {
        try {
            if (parentsToExpand.has(taskId)) {
                await table.expandRow(rowId);
            } else {
                table.collapseRow?.(rowId);
            }
        } catch (err) {
            console.warn("[WorkEfforts] expandParents", taskId, err);
        }
    }
}

function computeMissingPlanMaps(frm) {
    const missingPlanMap = {};
    const missingPlanPeriodsMap = {};
    const periods =
        frm.we?.periods ||
        project_workload_assignment.work_efforts.get_display_periods(frm, "month");
    const roleRows = roleRowsByTask(frm);
    const taskIds = Array.from(roleRows.keys());

    for (const taskId of taskIds) {
        const detailed = frm._detailedAssignments?.[taskId] || [];
        const hasPct = detailed.some((a) => a.workload === "В % от трудоемкости задачи");
        if (!hasPct) continue;

        const rolePeriodLoad = {};

        detailed.forEach((assignment) => {
            const role = assignment.role || "Без роли";
            const dateFrom = assignment.date_from;
            const dateTo = assignment.date_to;
            const wlValue = parseFloat(assignment.wl_value) || 0;
            if (wlValue <= 0) return;

            if (!rolePeriodLoad[role]) rolePeriodLoad[role] = new Set();

            periods.forEach((period) => {
                const periodStart = new Date(period.year, period.month - 1, 1);
                const periodEnd = new Date(period.year, period.month, 0);
                const assignFrom = dateFrom ? new Date(dateFrom) : null;
                const assignTo = dateTo ? new Date(dateTo) : null;
                let hasOverlap = false;

                if (assignFrom && assignTo) {
                    hasOverlap = periodStart <= assignTo && periodEnd >= assignFrom;
                } else if (assignFrom && !assignTo) {
                    hasOverlap = periodEnd >= assignFrom;
                } else if (!assignFrom && assignTo) {
                    hasOverlap = periodStart <= assignTo;
                } else {
                    hasOverlap = true;
                }

                if (hasOverlap) {
                    rolePeriodLoad[role].add(period.key || `${period.year}_${period.month}`);
                }
            });
        });

        const taskRoleRows = roleRows.get(taskId) || new Map();

        Object.keys(rolePeriodLoad).forEach((roleName) => {
            const gridRow =
                taskRoleRows.get(roleName)
                || (roleName === "Без роли" ? taskRoleRows.get("") : null)
                || taskRoleRows.get(String(roleName).trim());
            const loadedPeriods = Array.from(rolePeriodLoad[roleName]);
            if (!loadedPeriods.length) return;

            let hasPlan = false;
            const missingPeriods = [];

            loadedPeriods.forEach((periodKey) => {
                // period.key may be "2026_5"; also try unpadded / string month
                let planValue = gridRow ? parseFloat(gridRow[`plan_${periodKey}`]) || 0 : 0;
                if (!planValue && gridRow) {
                    const [y, m] = String(periodKey).split("_");
                    planValue =
                        parseFloat(gridRow[`plan_${y}_${parseInt(m, 10)}`])
                        || parseFloat(gridRow[`plan_${periodKey}`])
                        || 0;
                }
                if (planValue > 0) {
                    hasPlan = true;
                } else {
                    const [year, month] = periodKey.split("_");
                    missingPeriods.push({
                        year: parseInt(year, 10),
                        month: parseInt(month, 10),
                        period_key: periodKey,
                    });
                }
            });

            if (!hasPlan) {
                if (!missingPlanMap[taskId]) missingPlanMap[taskId] = [];
                if (!missingPlanMap[taskId].includes(roleName)) {
                    missingPlanMap[taskId].push(roleName);
                }
            }

            if (missingPeriods.length) {
                if (!missingPlanPeriodsMap[taskId]) missingPlanPeriodsMap[taskId] = {};
                missingPlanPeriodsMap[taskId][roleName] = missingPeriods;
            }
        });
    }

    return { missingPlanMap, missingPlanPeriodsMap };
}

export function refreshCheckHighlight(frm) {
    const api = frm.we?.table?.api;
    if (!api) return;
    // force re-run cellClassRules (missing-plan orange on plan zeros)
    if (typeof api.refreshCells === "function") {
        api.refreshCells({ force: true });
    }
    if (typeof api.redrawRows === "function") {
        api.redrawRows();
    }
}

/** Missing plan check (highlight + expand parents in DinextTable). */
export async function runMissingPlanCheck(frm) {
    if (!frm.we?.rows?.length) {
        frappe.msgprint(__("Сначала дождитесь загрузки данных таблицы трудозатрат"));
        return;
    }

    if (!frm.we?.table) {
        frappe.msgprint(__("Таблица трудозатрат еще не инициализирована"));
        return;
    }

    if (frm.hide_plan) {
        frm.hide_plan = false;
        project_workload_assignment.work_efforts.set_plan_checkbox?.(true);
        window.WorkEfforts?.onTogglePlanOrDelta?.(frm);
    }

    const we = project_workload_assignment.work_efforts;
    await we.load_detailed_assignments(frm);

    const { missingPlanMap, missingPlanPeriodsMap } = computeMissingPlanMaps(frm);
    frm._missingPlanMap = missingPlanMap;
    frm._missingPlanPeriodsMap = missingPlanPeriodsMap;

    we.updateTable?.(frm, "month", "hours");
    refreshCheckHighlight(frm);
    await expandParents(frm, missingPlanMap);

    const problemsCount = Object.values(missingPlanMap).reduce((sum, roles) => sum + roles.length, 0);
    if (problemsCount > 0) {
        frappe.show_alert(
            {
                message: __(
                    "Найдено {0} задач с загрузкой в % от трудоемкости без плановых трудозатрат",
                    [problemsCount]
                ),
                indicator: "orange",
            },
            5
        );
    } else {
        frappe.show_alert(
            {
                message: __("Не найдено задач с загрузкой в % от трудоемкости без плановых трудозатрат"),
                indicator: "green",
            },
            3
        );
    }
    project_workload_assignment.work_efforts.bring_overlays_into_fullscreen?.();
}

export function missingPlanTaskClassRules(frm) {
    return {
        "we-missing-plan-task": (params) => {
            const row = params.data;
            if (!row || row.merge_group_id === SUMMARY_ROW_ID) return false;
            if (row.merge_group_index !== 0) return false;
            return !!(frm._missingPlanMap?.[row.task_id]?.length);
        },
    };
}

export function missingPlanRoleClassRules(frm) {
    return {
        "we-missing-plan-role": (params) => {
            const row = params.data;
            if (!row || row.merge_group_id === SUMMARY_ROW_ID) return false;
            const roles = frm._missingPlanMap?.[row.task_id] || [];
            const key = roleKeyForMissingMap(row.role);
            return roles.includes(key) || (!!row.role && roles.includes(row.role));
        },
    };
}

function roleKeyForMissingMap(role) {
    return role ? String(role).trim() : "Без роли";
}

function missingPeriodsForRow(frm, row) {
    const byRole = frm._missingPlanPeriodsMap?.[row.task_id];
    if (!byRole) return [];
    const key = roleKeyForMissingMap(row.role);
    return byRole[key] || byRole[row.role] || byRole[""] || [];
}

export function missingPlanCellClassRules(frm, period) {
    return {
        "we-missing-plan-cell": (params) => {
            const row = params.data;
            if (!row || row.merge_group_id === SUMMARY_ROW_ID) return false;
            // remaining / empty role still highlight plan zeros when mapped
            const periods = missingPeriodsForRow(frm, row);
            if (!periods.length) return false;
            const periodKey = period.key || `${period.year}_${period.month}`;
            return periods.some(
                (p) =>
                    p.period_key === periodKey
                    || `${p.year}_${p.month}` === periodKey
                    || (p.year == period.year && p.month == period.month)
            );
        },
    };
}

/** Tooltip text for orange task cells (legacy data-tooltip / custom colored tip). */
export function missingPlanTaskTooltipValue(frm) {
    return (params) => {
        const row = params.data;
        if (!row || row.merge_group_id === SUMMARY_ROW_ID) return undefined;
        if (row.merge_group_index !== 0) return undefined;
        const roles = frm._missingPlanMap?.[row.task_id];
        if (!roles?.length) return undefined;
        return __("Work efforts are not defined for roles: {0}", [roles.join(", ")]);
    };
}

/** Tooltip text for orange role cells. */
export function missingPlanRoleTooltipValue(frm) {
    return (params) => {
        const row = params.data;
        if (!row || row.merge_group_id === SUMMARY_ROW_ID || !row.role) return undefined;
        const roles = frm._missingPlanMap?.[row.task_id] || [];
        if (!roles.includes(row.role)) return undefined;
        return __("Work efforts are not defined for role: {0}", [row.role]);
    };
}

