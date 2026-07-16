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

/**
 * Expand ancestors of tasks with missing plan; collapse other parents.
 * Uses DinextTable expandRow/collapseRow — no DOM synthetic click.
 */
export async function expandParentsV2(frm, missingPlanMap) {
    const table = frm.we_v2?.table;
    if (!table?.expandRow) return;

    const flat = flattenTree(frm.we_v2?.rows || []);
    const headByTask = new Map();
    for (const row of flat) {
        if (row.merge_group_index === 0 && row.merge_group_id !== SUMMARY_ROW_ID) {
            headByTask.set(row.task_id, row);
        }
    }

    const parentsToExpand = new Set();
    for (const taskId of Object.keys(missingPlanMap || {})) {
        let current = frm.aggregatedTasks?.[taskId];
        while (current?.parent_task) {
            parentsToExpand.add(current.parent_task);
            current = frm.aggregatedTasks[current.parent_task];
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
            console.warn("[WorkEfforts] expandParentsV2", taskId, err);
        }
    }
}

function computeMissingPlanMaps(frm) {
    const missingPlanMap = {};
    const missingPlanPeriodsMap = {};
    const periods =
        frm.we_v2?.periods ||
        project_workload_assignment.work_efforts.get_display_periods(frm, "month");
    const taskIds = Object.keys(frm.aggregatedTasks || {});

    for (const taskId of taskIds) {
        const taskData = frm.aggregatedTasks[taskId];
        if (!taskData) continue;

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

        Object.keys(rolePeriodLoad).forEach((roleName) => {
            const roleEntry = (taskData.role_data || []).find((r) => r && r.role === roleName);
            const loadedPeriods = Array.from(rolePeriodLoad[roleName]);
            if (!loadedPeriods.length) return;

            let hasPlan = false;
            const missingPeriods = [];

            loadedPeriods.forEach((periodKey) => {
                const planValue = roleEntry ? parseFloat(roleEntry[`plan_${periodKey}`]) || 0 : 0;
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
    const api = frm.we_v2?.table?.api;
    if (!api?.refreshCells) return;
    api.refreshCells({ force: true });
}

/** Missing plan check (highlight + expand parents in DinextTable). */
export async function runMissingPlanCheck(frm) {
    if (!frm.aggregatedTasks || !Object.keys(frm.aggregatedTasks).length) {
        frappe.msgprint(__("Сначала дождитесь загрузки данных таблицы трудозатрат"));
        return;
    }

    if (!frm.we_v2?.table) {
        frappe.msgprint(__("Таблица трудозатрат еще не инициализирована"));
        return;
    }

    if (frm.hide_plan) {
        frm.hide_plan = false;
        $("#toggle_plan").text(__("Скрыть план"));
        window.WorkEffortsV2?.onTogglePlanOrDelta?.(frm);
    }

    const we = project_workload_assignment.work_efforts;
    await we.load_detailed_assignments(frm);

    const { missingPlanMap, missingPlanPeriodsMap } = computeMissingPlanMaps(frm);
    frm._missingPlanMap = missingPlanMap;
    frm._missingPlanPeriodsMap = missingPlanPeriodsMap;

    we.updateTable?.(frm, "month", "hours");
    refreshCheckHighlight(frm);
    await expandParentsV2(frm, missingPlanMap);

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
}

export function missingPlanTaskClassRules(frm) {
    return {
        "we-v2-missing-plan-task": (params) => {
            const row = params.data;
            if (!row || row.merge_group_id === SUMMARY_ROW_ID) return false;
            if (row.merge_group_index !== 0) return false;
            return !!(frm._missingPlanMap?.[row.task_id]?.length);
        },
    };
}

export function missingPlanRoleClassRules(frm) {
    return {
        "we-v2-missing-plan-role": (params) => {
            const row = params.data;
            if (!row || row.merge_group_id === SUMMARY_ROW_ID || !row.role) return false;
            return !!(frm._missingPlanMap?.[row.task_id] || []).includes(row.role);
        },
    };
}

export function missingPlanCellClassRules(frm, period) {
    return {
        "we-v2-missing-plan-cell": (params) => {
            const row = params.data;
            if (!row || row.merge_group_id === SUMMARY_ROW_ID || !row.role) return false;
            const periods = frm._missingPlanPeriodsMap?.[row.task_id]?.[row.role] || [];
            return periods.some((p) => p.period_key === period.key || `${p.year}_${p.month}` === period.key);
        },
    };
}
