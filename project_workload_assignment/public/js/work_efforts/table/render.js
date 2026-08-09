// we-table/render.js — shell + form hooks for «Трудозатраты»
// ISS-2025-01239 — W1: DinextTable in .work-efforts-table; domain actions → toolbar

/**
 * Синхронизация задач WE -> P&L без повторной инъекции (guard от double pass).
 * @param {WorkEffortsForm} frm
 */
function syncPlTaskDimensionFromWe(frm) {
    // Project Budget owns task x account tree server-side; refresh grid after WE changes.
    if (typeof updateTaskDimension === "function") {
        updateTaskDimension(frm);
        return;
    }
    if (window.ProjectBudget?.refresh) {
        window.ProjectBudget.refresh(frm);
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
 * Require work-efforts.bundle and mount DinextTable.
 * @param {WorkEffortsForm} frm
 * @param {() => void} [callback]
 */
function with_we_ready(frm, callback) {
    const run = () => {
        const mounted = Promise.resolve(window.WorkEfforts.ensureMounted(frm));
        return mounted
            .then(() => {
                callback?.();
            })
            .catch((err) => {
                console.error("[WorkEfforts] ensureMounted failed", err);
            });
    };

    if (window.WorkEfforts?.isReady?.()) {
        return run();
    }

    return new Promise((resolve) => {
        frappe.require([frappe.assets.bundled_asset("work-efforts.bundle.js")], () => {
            if (!window.WorkEfforts?.isReady?.()) {
                console.error("[WorkEfforts] work-efforts.bundle.js did not register WorkEfforts");
                resolve();
                return;
            }
            resolve(run());
        });
    }).then((result) => result);
}

function destroy_we(frm) {
    window.WorkEfforts?.destroy?.(frm);
}

function ensureWeDefaults(frm) {
    if (frm.show_assignments === undefined) {
        frm.show_assignments = false;
    }
    if (frm.hide_plan === undefined) {
        frm.hide_plan = true;
    }
    if (frm.hide_delta === undefined) {
        frm.hide_delta = true;
    }
    frm._we_period_type = frm._we_period_type || "month";
    frm._we_unit = frm._we_unit || "hours";
    frm.view_options = frm.view_options || __("Forecast and Fact");
}

/**
 * Shell «Трудозатраты»: table host + legend. Domain buttons live in DinextTable toolbar.
 * @param {WorkEffortsForm} frm
 */
function render_work_efforts_table(frm) {
    ensureWeDefaults(frm);

    if (frm.last_loaded_project == frm.doc.name && (new Date() - frm.last_loaded_time) < 300000) {
        schedule_we_mount(frm);
        return;
    }

    const wrapper = frm.get_field("custom_work_efforts").$wrapper;
    wrapper.addClass("work_efforts_container");
    destroy_we(frm);
    wrapper.empty();

    frm.aggregatedTasks = null;
    frm.we_periods = {};

    $('<div class="work-efforts-table"></div>').appendTo(wrapper);

    frm.last_loaded_project = frm.doc.name;
    frm.last_loaded_time = new Date();

    schedule_we_mount(frm);
}

/** Shell on refresh; grid only when tab «Трудозатраты» is visible. */
function schedule_we_mount(frm) {
    const bind = project_workload_assignment.bindLazyTabMount;
    if (typeof bind !== "function") {
        console.error("[WorkEfforts] bindLazyTabMount missing — refuse eager mount");
        return;
    }
    bind(frm, "custom_work_efforts", () => with_we_ready(frm));
}

/**
 * Side-effects for toggles: limits + workload map (+ assignments cache).
 * Grid UI refresh is WorkEfforts (not StickyDataTable).
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
    with_we_ready,
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
