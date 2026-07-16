// we-table/render.js — render_work_efforts_table, updateTable, frappe.ui.form.on Project
// ISS-2025-01239 — W1: DinextTable in .work-efforts-table; Sticky WE grid removed from UI path

/**
 * Синхронизация задач WE -> P&L без повторной инъекции (guard от double pass).
 * @param {WorkEffortsForm} frm
 */
function syncPlTaskDimensionFromWe(frm) {
    // P&L v2 owns task x account tree server-side; refresh grid after WE changes.
    if (typeof updateTaskDimension === "function") {
        updateTaskDimension(frm);
        return;
    }
    if (window.ProjectPlV2?.refresh) {
        window.ProjectPlV2.refresh(frm);
    }
}

/**
 * @param {WorkEffortsForm} frm
 * @param {string[]} roles
 * @param {DisplayPeriod} period
 * @param {boolean} [calc_plan]
 * @param {boolean} [calc_fact]
 * @returns {ColumnTotal}
 */
function calc_we_column_total(frm, roles, period, calc_plan = true, calc_fact = false) {
    return project_workload_assignment.work_efforts.calc_we_column_total_optimized(frm, roles, period, calc_plan, calc_fact);
}

/**
 * Require we-v2.bundle and mount DinextTable.
 * @param {WorkEffortsForm} frm
 * @param {() => void} [callback]
 */
function with_we_v2_ready(frm, callback) {
    const run = () => {
        window.WorkEffortsV2.ensureMounted(frm);
        callback?.();
    };

    if (window.WorkEffortsV2?.isReady?.()) {
        run();
        return;
    }

    frappe.require([frappe.assets.bundled_asset("we-v2.bundle.js")], () => {
        if (!window.WorkEffortsV2?.isReady?.()) {
            console.error("[WorkEfforts] we-v2.bundle.js did not register WorkEffortsV2");
            return;
        }
        run();
    });
}

function destroy_we_v2(frm) {
    window.WorkEffortsV2?.destroy?.(frm);
}

/**
 * Отрисовка таблицы «Трудозатраты» — shell + DinextTable (v2).
 * @param {WorkEffortsForm} frm
 */
function render_work_efforts_table(frm) {
    if (frm.show_assignments === undefined) {
        frm.show_assignments = false;
    }

    if (frm.last_loaded_project == frm.doc.name && (new Date() - frm.last_loaded_time) < 300000) {
        with_we_v2_ready(frm);
        return;
    }

    let wrapper = frm.get_field("custom_work_efforts").$wrapper;
    wrapper.addClass("work_efforts_container");
    destroy_we_v2(frm);
    wrapper.empty();

    frm.aggregatedTasks = null;
    frm.we_periods = {};

    let controls = $('<div class="work-efforts-controls"></div>').appendTo(wrapper);
    $('<div class="work-efforts-table"></div>').appendTo(wrapper);
    let legend_container = $('<div class="work-efforts-legend"></div>').appendTo(wrapper);

    controls.append(`
        <button class="btn btn-default" id="we_save_plan">${__('Сохранить план')}</button>
        <button class="btn btn-default" id="toggle_plan">${__("Показать план")}</button>
        <button class="btn btn-default" id="toggle_delta">${__("Показать Δ")}</button>
    `);

    project_workload_assignment.work_efforts.addViewOptionsControl(frm, controls);

    let selectedPeriodType = "month";
    let selectedUnit = "hours";
    frm._we_period_type = selectedPeriodType;
    frm._we_unit = selectedUnit;

    let checkbox_wrapper = $('<div class="assignments-checkbox-wrapper"></div>').appendTo(controls);

    let assignments_checkbox = frappe.ui.form.make_control({
        parent: checkbox_wrapper,
        df: {
            fieldtype: 'Check',
            fieldname: 'show_assignments',
            label: __("Назначения"),
            onchange: function() {
                frm.show_assignments = this.get_value();

                const notifyV2 = () => {
                    with_we_v2_ready(frm, () => {
                        window.WorkEffortsV2.onAssignmentsToggle(frm);
                    });
                };

                if (frm.show_assignments) {
                    project_workload_assignment.work_efforts.load_all_assignments_if_needed(frm).then(notifyV2);
                } else {
                    notifyV2();
                }
            }
        },
        value: frm.show_assignments,
        only_input: false,
        render_input: true
    });

    assignments_checkbox.refresh();

    controls.append(`
        <div class="btn-group">
            <button class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                ${__('Проверить')} <span class="caret"></span>
            </button>
            <ul class="dropdown-menu dropdown-menu-right">
                <li id="check_plan_load">${__('Наличие плановых трудозатрат')}</li>
                <li id="check_workload_overload">${__('Загрузка превышает прогноз трудозатрат')}</li>
            </ul>
        </div>
    `);

    frm.hide_plan = frm.hide_plan || true;
    frm.hide_delta = frm.hide_delta || true;

    controls.find('#we_save_plan').on('click', function() {
        with_we_v2_ready(frm, () => {
            window.WorkEffortsV2.saveForecastAsPlan(frm);
        });
    });

    controls.find('#toggle_plan').on('click', function() {
        frm.hide_plan = !frm.hide_plan;
        $(this).text(frm.hide_plan ? __("Показать план") : __("Скрыть план"));
        project_workload_assignment.work_efforts.updateTable(frm, selectedPeriodType, selectedUnit);
        project_workload_assignment.work_efforts.render_work_efforts_chart(frm);
        with_we_v2_ready(frm, () => {
            window.WorkEffortsV2.onTogglePlanOrDelta(frm);
        });
    });

    controls.find('#toggle_delta').on('click', function() {
        frm.hide_delta = !frm.hide_delta;
        $(this).text(frm.hide_delta ? __("Показать Δ") : __("Скрыть Δ"));
        project_workload_assignment.work_efforts.updateTable(frm, selectedPeriodType, selectedUnit);
        with_we_v2_ready(frm, () => {
            window.WorkEffortsV2.onTogglePlanOrDelta(frm);
        });
    });

    controls.find('#check_plan_load').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        with_we_v2_ready(frm, () => {
            window.WorkEffortsV2.runMissingPlanCheck(frm);
        });
    });

    //ISS-2025-02858 — overload API+dialog reuse as-is
    controls.find('#check_workload_overload').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        project_workload_assignment.work_efforts.perform_overload_check(frm);
    });

    // W3b: GRID_V2 only on boot. Chart/limits/P&L sync run after we_v2 load.
    // Consolidated (aggregatedTasks) — lazy for overload / pl-from-we dialogs.
    frm.last_loaded_project = frm.doc.name;
    frm.last_loaded_time = new Date();

    project_workload_assignment.work_efforts.render_legend(legend_container);
    with_we_v2_ready(frm);
}

/**
 * Side-effects for toggles: limits + workload map (+ assignments cache).
 * Grid UI refresh is WorkEffortsV2 (not StickyDataTable).
 * @param {WorkEffortsForm} frm
 * @param {string} periodType
 * @param {string} unit
 * @param {boolean} [skipRestore]
 */
function updateTable(frm, periodType, unit, skipRestore = false) {
    project_workload_assignment.work_efforts.recalculatePeriodLimits(frm, periodType, function() {
        if (skipRestore) return;

        setTimeout(() => {
            project_workload_assignment.work_efforts.buildWorkloadPeriodsMap(frm).then(() => {
                if (frm.show_assignments) {
                    project_workload_assignment.work_efforts.load_all_assignments_if_needed(frm);
                }
            });
        }, 100);
    });
}

Object.assign(project_workload_assignment.work_efforts, {
    render_work_efforts_table,
    updateTable,
    syncPlTaskDimensionFromWe,
    calc_we_column_total,
    with_we_v2_ready,
});

frappe.ui.form.on("Project", {
    refresh: function(frm) {
        project_workload_assignment.work_efforts.render_work_efforts_table(frm);
    },
    onload: function(frm) {
        frm.show_assignments = false;
        project_workload_assignment.work_efforts.render_work_efforts_table(frm);
    },
    after_save: function(frm) {
        project_workload_assignment.work_efforts.refreshLimitHighlight(frm);
    },
});
