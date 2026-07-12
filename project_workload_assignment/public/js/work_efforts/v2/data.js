import { PERIOD_FIELD_RE, ROW_ID_SEP } from "./constants.js";
import { initState } from "./state.js";
import { buildSummaryRows } from "./summary.js";

function getGridApi() {
    return (
        project_workload_assignment.pwrApi?.GRID_V2 ||
        "project_workload_assignment.project_workload_api.get_work_efforts_grid_v2"
    );
}

function rowId(apiRow) {
    return `${apiRow.task_id}${ROW_ID_SEP}${apiRow.role || ""}`;
}

function copyPeriodFields(apiRow, gridRow) {
    for (const [key, value] of Object.entries(apiRow)) {
        if (PERIOD_FIELD_RE.test(key)) {
            gridRow[key] = value;
        }
    }
}

function copyTaskDates(apiRow, gridRow) {
    gridRow.exp_start_date = apiRow.exp_start_date || null;
    gridRow.exp_end_date = apiRow.exp_end_date || null;
    gridRow.custom_planned_start_date = apiRow.custom_planned_start_date || null;
    gridRow.custom_planned_end_date = apiRow.custom_planned_end_date || null;
    gridRow.act_start_date = apiRow.act_start_date || null;
    gridRow.act_end_date = apiRow.act_end_date || null;
}

function toGridRow(apiRow, index) {
    const gridRow = {
        id: rowId(apiRow),
        task_id: apiRow.task_id,
        task_subject: index === 0 ? apiRow.task_subject || "" : "",
        role: apiRow.role || "",
        _selected: false,
        merge_group_id: apiRow.merge_group_id,
        merge_group_index: apiRow.merge_group_index,
        merge_group_size: apiRow.merge_group_size,
    };
    copyTaskDates(apiRow, gridRow);
    copyPeriodFields(apiRow, gridRow);
    return gridRow;
}

export function buildTreeData(flatRows) {
    const taskOrder = [];
    const groupsByTask = new Map();

    for (const row of flatRows) {
        const taskId = row.task_id;
        if (!groupsByTask.has(taskId)) {
            groupsByTask.set(taskId, {
                apiRows: [],
                parent_task_id: row.parent_task_id || null,
            });
            taskOrder.push(taskId);
        }
        groupsByTask.get(taskId).apiRows.push(row);
    }

    function childNodes(parentTaskId) {
        const nodes = [];

        for (const taskId of taskOrder) {
            const group = groupsByTask.get(taskId);
            const parent = group.parent_task_id || null;
            if (parent !== parentTaskId) {
                continue;
            }

            const gridRows = group.apiRows.map((apiRow, index) => toGridRow(apiRow, index));
            const head = gridRows[0];
            const nested = childNodes(taskId);

            if (nested.length) {
                head.children = nested;
            }

            nodes.push(...gridRows);
        }

        return nodes;
    }

    return childNodes(null);
}

function normalizeViewMode(viewOptions) {
    if (viewOptions === __("Только прогноз")) {
        return "forecast_only";
    }
    if (viewOptions === __("Только факт")) {
        return "fact_only";
    }
    return "forecast_and_fact";
}

function getPeriodsFromForm(frm, periodType) {
    const viewMode = normalizeViewMode(frm.view_options || __("Прогноз и факт"));
    const legacy = project_workload_assignment.work_efforts;
    const periods = legacy.get_display_periods(frm, periodType || frm._we_period_type || "month");

    return periods.map((period) => {
        let isPast = !!period.is_past;
        if (viewMode === "forecast_only") {
            isPast = false;
        } else if (viewMode === "fact_only") {
            isPast = true;
        }
        return {
            year: period.year,
            month: period.month,
            key: `${period.year}_${period.month}`,
            is_past: isPast,
        };
    });
}

function canReuseLegacyConsolidated(frm) {
    return !!(
        frm.aggregatedTasks &&
        Object.keys(frm.aggregatedTasks).length > 0 &&
        frm.last_loaded_project === frm.doc.name
    );
}

function calcDeltaPct(plan, actual) {
    if (!plan) {
        return 0;
    }
    return Math.round(((actual - plan) / plan) * 1000) / 10;
}

function resolveActual(roleEntry, periodKey, isPast, viewMode) {
    const forecast = Number(roleEntry[`forecast_${periodKey}`] || 0);
    const fact = Number(roleEntry[`fact_${periodKey}`] || 0);
    if (viewMode === "forecast_only") {
        return forecast;
    }
    if (viewMode === "fact_only") {
        return fact;
    }
    return isPast ? fact : forecast;
}

export function flattenFromLegacy(tasks, periods, viewMode) {
    const parentHasChild = new Set();
    for (const task of tasks) {
        if (task.parent_task) {
            parentHasChild.add(task.parent_task);
        }
    }

    const flatRows = [];
    for (const task of tasks) {
        const taskId = task.value;
        let roleRows = (task.role_data || []).filter((r) => (r.role || "").trim());
        if (!roleRows.length) {
            roleRows = [{ role: null }];
        } else {
            roleRows = [...roleRows].sort((a, b) => (a.role || "").localeCompare(b.role || ""));
        }

        const mergeSize = roleRows.length;
        const hasChildren = !!task.expandable || parentHasChild.has(taskId);

        roleRows.forEach((roleEntry, index) => {
            const row = {
                task_id: taskId,
                task_subject: index === 0 ? task.subject || "" : null,
                role: roleEntry.role || null,
                parent_task_id: task.parent_task || null,
                merge_group_id: `task-${taskId}`,
                merge_group_index: index,
                merge_group_size: mergeSize,
                has_children: index === 0 && hasChildren,
                exp_start_date: task.exp_start_date || null,
                exp_end_date: task.exp_end_date || null,
                custom_planned_start_date: task.custom_planned_start_date || null,
                custom_planned_end_date: task.custom_planned_end_date || null,
                act_start_date: task.act_start_date || null,
                act_end_date: task.act_end_date || null,
            };

            for (const period of periods) {
                const key = period.key;
                const plan = Number(roleEntry[`plan_${key}`] || 0);
                const forecast = Number(roleEntry[`forecast_${key}`] || 0);
                const fact = Number(roleEntry[`fact_${key}`] || 0);
                const actual = resolveActual(roleEntry, key, period.is_past, viewMode);

                row[`plan_${key}`] = plan;
                row[`forecast_${key}`] = forecast;
                row[`fact_${key}`] = fact;
                row[`actual_${key}`] = actual;
                row[`delta_${key}`] = calcDeltaPct(plan, actual);
                const utps = roleEntry[`fact_utps_${key}`];
                if (utps?.length) {
                    row[`fact_utps_${key}`] = utps;
                }
            }

            flatRows.push(row);
        });
    }

    return flatRows;
}

function applyGridResponse(frm, message) {
    const state = initState(frm);
    state.periods = message.periods || [];
    state.rows = buildTreeData(message.rows || []);
    state.summaryRows = buildSummaryRows(frm, state.periods, message.summary_rows);
    return message;
}

export async function loadGridData(frm, periodType) {
    const period_type = periodType || frm._we_period_type || "month";

    if (canReuseLegacyConsolidated(frm)) {
        const periods = getPeriodsFromForm(frm, period_type);
        const view_mode = normalizeViewMode(frm.view_options || __("Прогноз и факт"));
        const rows = flattenFromLegacy(Object.values(frm.aggregatedTasks), periods, view_mode);
        return applyGridResponse(frm, {
            project: frm.doc.name,
            period_type,
            view_mode,
            periods,
            rows,
            summary_rows: buildSummaryRows(frm, periods),
        });
    }

    try {
        const message = await frappe.xcall(getGridApi(), {
            project: frm.doc.name,
            period_type,
            view_options: frm.view_options || __("Прогноз и факт"),
            view_mode: normalizeViewMode(frm.view_options || __("Прогноз и факт")),
            include_plan: frm.hide_plan ? 0 : 1,
        });
        if (!message) {
            throw new Error("Empty grid response");
        }
        return applyGridResponse(frm, message);
    } catch (err) {
        console.error("[WorkEfforts] grid load failed", err);
        frappe.msgprint(__("Ошибка загрузки данных трудозатрат"));
        throw err;
    }
}

export async function reloadTable(frm, initTable, refreshRuntime) {
    if (!frm._we_v2_enabled) {
        return null;
    }

    const state = frm.we_v2;
    if (!state?.container) {
        return null;
    }

    await loadGridData(frm);
    if (state.table) {
        await refreshRuntime(frm);
        return state.table;
    }
    return initTable(frm);
}
