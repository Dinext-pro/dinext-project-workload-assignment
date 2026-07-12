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

function getSavePlanApi() {
    return (
        project_workload_assignment.pwrApi?.SAVE_FORECAST_PLAN ||
        "project_workload_assignment.project_workload_api.save_forecast_as_plan"
    );
}

export function getSelectedTaskIds(frm) {
    const flat = flattenTree(frm.we_v2?.rows || []);
    const taskIds = [];
    const seen = new Set();

    for (const row of flat) {
        if (!row._selected || row.merge_group_index !== 0) continue;
        if (row.merge_group_id === SUMMARY_ROW_ID) continue;
        const taskId = row.task_id;
        if (!taskId || seen.has(taskId)) continue;
        seen.add(taskId);
        taskIds.push(taskId);
    }

    return taskIds;
}

export function buildSavePlanPayload(frm) {
    const selectedIds = new Set(getSelectedTaskIds(frm));
    if (!selectedIds.size) return [];

    const periods = frm.we_v2?.periods || [];
    const flat = flattenTree(frm.we_v2?.rows || []);
    const data = [];

    for (const row of flat) {
        if (!selectedIds.has(row.task_id)) continue;
        if (row.merge_group_id === SUMMARY_ROW_ID) continue;

        const role = row.role || "";
        for (const period of periods) {
            const key = period.key;
            const currentPlan = Number(row[`plan_${key}`] || 0);
            const newPlanValue = period.is_past
                ? Number(row[`fact_${key}`] || 0)
                : Number(row[`forecast_${key}`] || 0);

            if (newPlanValue !== currentPlan && (newPlanValue > 0 || currentPlan > 0)) {
                data.push({
                    task: row.task_id,
                    role,
                    year: period.year,
                    month: period.month,
                    plan_value: newPlanValue,
                    current_plan: currentPlan,
                });
            }
        }
    }

    return data;
}

async function postSaveRefresh(frm) {
    frappe.show_alert(__("Данные успешно сохранены как план"), 5);

    if (project_workload_assignment.work_efforts?.clear_assignments_cache) {
        project_workload_assignment.work_efforts.clear_assignments_cache();
    }

    frm.last_loaded_time = null;
    frm.last_loaded_project = null;

    if (project_workload_assignment.work_efforts?.clearTaskIndexCacheFor) {
        project_workload_assignment.work_efforts.clearTaskIndexCacheFor(frm.aggregatedTasks);
    }

    frm._missingPlanMap = {};
    frm._missingPlanPeriodsMap = {};

    const periodType = frm._we_period_type || "month";
    if (project_workload_assignment.work_efforts?.load_work_efforts_data) {
        project_workload_assignment.work_efforts.load_work_efforts_data(frm, periodType, "hours", true);
    }

    if (typeof load_and_render_project_dashboard === "function") {
        load_and_render_project_dashboard(frm);
    }

    if (window.WorkEffortsV2?.refresh) {
        await window.WorkEffortsV2.refresh(frm);
    }
}

async function executeSaveForecastAsPlan(frm, data) {
    const res = await frappe.xcall(getSavePlanApi(), {
        project: frm.doc.name,
        data: JSON.stringify(data),
    });

    if (res?.exc) {
        throw new Error(res.exc);
    }

    await postSaveRefresh(frm);
}

export function saveForecastAsPlan(frm) {
    const selected = getSelectedTaskIds(frm);
    if (!selected.length) {
        frappe.msgprint(__("Выберите задачи, для которых необходимо сохранить плановые данные."));
        return;
    }

    const data = buildSavePlanPayload(frm);
    if (!data.length) {
        frappe.msgprint(__("Нет изменений для сохранения."));
        return;
    }

    frappe.confirm(
        __("Вы уверены, что хотите сохранить выбранные прогнозные / фактические данные как плановые?"),
        () => {
            executeSaveForecastAsPlan(frm, data).catch((err) => {
                frappe.msgprint(__("Ошибка при сохранении плана"));
                console.error(err);
            });
        },
        () => {
            frappe.show_alert(__("Операция отменена"), 3);
        }
    );
}
