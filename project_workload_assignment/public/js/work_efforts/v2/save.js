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

function getForecast(rows, taskId, role, periodKey) {
    const flat = flattenTree(rows);
    const row = flat.find((r) => r.task_id === taskId && r.role === role);
    return Number(row?.[`forecast_${periodKey}`] || 0);
}

function getChildForecastSum(rows, taskId, role, periodKey, excluded = []) {
    const flat = flattenTree(rows);
    const childTasks = new Set();
    for (const row of flat) {
        if (row.parent_task_id === taskId && !excluded.includes(row.task_id)) {
            childTasks.add(row.task_id);
        }
    }

    let sum = 0;
    for (const childId of childTasks) {
        if (excluded.includes(childId)) continue;
        const childForecast = getForecast(rows, childId, role, periodKey);
        if (childForecast > 0) {
            sum += childForecast;
        } else {
            sum += getChildForecastSum(rows, childId, role, periodKey, [...excluded, childId]);
        }
    }
    return sum;
}

function getParentForecastLimit(rows, taskId, role, periodKey, excluded = []) {
    const flat = flattenTree(rows);
    const row = flat.find((r) => r.task_id === taskId && r.role === role);
    if (!row?.parent_task_id) return null;

    const parentId = row.parent_task_id;
    const parentForecast = getForecast(rows, parentId, role, periodKey);
    if (parentForecast > 0) {
        const siblingsSum = getChildForecastSum(rows, parentId, role, periodKey, [...excluded, taskId]);
        return parentForecast - siblingsSum;
    }

    return getParentForecastLimit(rows, parentId, role, periodKey, [...excluded, taskId]);
}

function validateForecastChange(frm, change) {
    const field = change.field;
    if (!field?.startsWith("actual_")) return true;

    const periodKey = field.slice(7);
    const row = change.row;
    const value = Number(change.newValue || 0);
    const taskId = row?.task_id;
    const role = row?.role || "";
    const rows = frm.we_v2?.rows || [];

    if (!taskId || !periodKey) return true;

    const childrenSum = getChildForecastSum(rows, taskId, role, periodKey);
    if (childrenSum > 0 && value < childrenSum) {
        return __(
            "Значение не может быть меньше суммы трудозатрат дочерних задач ({0})",
            [childrenSum.toFixed(0)]
        );
    }

    const parentLimit = getParentForecastLimit(rows, taskId, role, periodKey);
    if (parentLimit !== null && value > parentLimit) {
        return __(
            "Значение трудозатрат не может превышать {0} (ограничение родительской задачи)",
            [parentLimit.toFixed(0)]
        );
    }

    return true;
}

export function onValidateCells(frm, { changes }) {
    for (const change of changes) {
        const result = validateForecastChange(frm, change);
        if (result !== true) {
            frappe.msgprint(result);
            return false;
        }
    }
    return true;
}

function buildSavePayload(changes) {
    return changes
        .filter((change) => change.field?.startsWith("actual_"))
        .map((change) => {
            const periodKey = change.field.slice(7);
            const [year, month] = periodKey.split("_");
            return {
                task_id: change.row?.task_id,
                role: change.row?.role || "",
                period_key: periodKey,
                year: Number(year),
                month: Number(month),
                value: Number(change.newValue || 0),
            };
        });
}

export async function onSaveCells(frm, { changes }) {
    const payload = buildSavePayload(changes);
    if (!payload.length) return true;

    const res = await frappe.xcall(
        "project_workload_assignment.project_workload_api.we_v2_save_forecast_changes",
        {
            project: frm.doc.name,
            changes: JSON.stringify(payload),
        }
    );

    if (res?.exc) {
        throw new Error(res.exc);
    }

    frappe.show_alert(__("Данные успешно обновлены"), 5);

    project_workload_assignment.work_efforts?.clear_aggregated_tasks?.(frm);
    if (project_workload_assignment.work_efforts?.clear_assignments_cache) {
        project_workload_assignment.work_efforts.clear_assignments_cache();
    }

    if (project_workload_assignment.work_efforts?.buildWorkloadPeriodsMap) {
        await project_workload_assignment.work_efforts.buildWorkloadPeriodsMap(frm);
    }
    if (project_workload_assignment.work_efforts?.updateTable) {
        project_workload_assignment.work_efforts.updateTable(frm, "month", "hours");
    }

    // refreshRuntime → chart from we_v2
    if (window.WorkEffortsV2?.refresh) {
        await window.WorkEffortsV2.refresh(frm);
    }
    return true;
}
