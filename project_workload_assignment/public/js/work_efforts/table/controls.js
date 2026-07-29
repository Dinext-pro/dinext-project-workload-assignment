// we-table/controls.js — view controls, period helpers, legend
// ISS-2025-01239

/**
 * @param {WorkEffortsForm} frm
 * @returns {string[]}
 */
function get_project_roles(frm) {
    let roles = [];
    if (frm.doc.custom_ts_details) {
        roles = frm.doc.custom_ts_details.map((x) => x.pt_role);
    }
    roles.push("");
    return Array.from(new Set(roles));
}

/**
 * @param {WorkEffortsForm} frm
 * @param {string} periodType
 * @returns {DisplayPeriod[]}
 */
function get_display_periods(frm, periodType) {
    if (frm.we_periods && frm.we_periods[periodType]) return frm.we_periods[periodType];
    if (!frm.we_periods) frm.we_periods = {};
    frm.view_options = frm.view_options || __("Forecast and Actual");

    let periods = [];
    let month_start = frappe.datetime.month_start();
    let start_date = frm.doc.expected_start_date ? frm.doc.expected_start_date : month_start;
    let start = frappe.datetime.str_to_obj(start_date);
    let end_date = frm.doc.expected_end_date
        ? frm.doc.expected_end_date
        : frappe.datetime.add_months(start, 12);
    let end = frappe.datetime.str_to_obj(end_date);

    if (periodType === "month") {
        let current = start;
        while (frappe.datetime.obj_to_str(current) <= frappe.datetime.obj_to_str(end)) {
            let year = current.getFullYear();
            let i = current.getMonth();
            let is_past = (frm.view_options == __("Forecast and Actual"))
                ? frappe.datetime.obj_to_str(current) < month_start
                : (frm.view_options == __("Actual Only"));
            periods.push({ year: year, month: i + 1, is_past: is_past });
            current = frappe.datetime.str_to_obj(frappe.datetime.add_months(current, 1));
        }
    }

    frm.we_periods[periodType] = periods;
    return periods;
}

/**
 * @param {WorkEffortsForm} frm
 * @param {JQuery} controls
 */
function addViewOptionsControl(frm, controls) {
    frm.view_options = frm.view_options || __("Forecast and Actual");
    const control = frappe.ui.form.make_control({
        parent: controls,
        df: {
            fieldtype: 'Select',
            fieldname: "view-options",
            options: [
                __("Forecast and Actual"),
                __("Forecast Only"),
                __("Actual Only"),
            ],
            get_status: function(i) {
                return "Write";
            },
            change: async function(i) {
                if (this.value != this.last_value) {
                    frm.we_periods = {};
                    frm.view_options = this.value;
                    project_workload_assignment.work_efforts.updateTable(frm, "month", "hours");
                    project_workload_assignment.work_efforts.render_work_efforts_chart(frm);
                }
            }
        },
        value: frm.view_options,
        only_input: true,
        render_input: true
    });
}

/** @param {JQuery} container */
function render_legend(container) {
    let legend_html = `
        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 16px 24px; padding: 8px 12px; background: var(--fg-color); border: 1px solid var(--border-color); border-radius: 4px;">

            <!-- Плановые сроки -->
            <div style="display: flex; align-items: center; gap: 6px;">
                <div style="width: 16px; height: 16px; background-color: var(--we-period-plan-bg); border-radius: 2px; border: 1px solid var(--border-color);" class="we-legend-plan-swatch"></div>
                <span>${__("Planned Task Dates")}</span>
            </div>

            <!-- Прогнозные сроки -->
            <div style="display: flex; align-items: center; gap: 6px;">
                <div style="width: 16px; height: 16px; background-color: var(--we-period-forecast-bg); border-radius: 2px; border: 1px solid var(--border-color);" class="we-legend-forecast-swatch"></div>
                <span>${__("Forecast Task Dates")}</span>
            </div>

            <!-- Загрузка -->
            <div style="display: flex; align-items: center; gap: 6px;">
                <div style="width: 16px; height: 16px; background-color: var(--we-period-forecast-bg); border-radius: 2px; border: 1px solid var(--border-color); position: relative;" class="we-legend-workload-swatch">
                    <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-image: radial-gradient(circle, #c8d0d8 1px, transparent 1px); background-size: 4px 4px; border-radius: 1px;"></div>
                </div>
                <span>${__("Workload")}</span>
            </div>

            <!-- Отсутствие плана -->
            <div style="display: flex; align-items: center; gap: 6px;">
                <div style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; background: var(--fg-color); border: 1px solid var(--border-color); border-radius: 2px;">
                    <span style="color: var(--alert-text-warning); font-weight: 700; font-size: 11px;">0</span>
                </div>
                <span>${__("Plan is missing while workload is present")}</span>
            </div>

            <!-- Новая строка с лимитами -->
            <div style="width: 100%; height: 1px; background: var(--border-color); margin: 4px 0;"></div>

            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 16px 24px; width: 100%;">

                <!-- Норма -->
                <div style="display: flex; align-items: center; gap: 6px;">
                    <div class="we-legend-limit-normal" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 22px; border-radius: 1px; background: var(--fg-color);">
                        <span style="color: var(--text-color); font-weight: 500; font-size: 12px;">85</span>
                    </div>
                    <span>${__("Norm")}</span>
                </div>

                <!-- Предупреждение -->
                <div style="display: flex; align-items: center; gap: 6px;">
                    <div class="we-legend-limit-warning" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 22px; border-radius: 1px; background: var(--fg-color);">
                        <span style="color: var(--text-color); font-weight: 600; font-size: 12px;">105</span>
                    </div>
                    <span>${__("Warning")}</span>
                </div>

                <!-- Блокировка -->
                <div style="display: flex; align-items: center; gap: 6px;">
                    <div class="we-legend-limit-block" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 22px; border-radius: 1px; background: var(--fg-color);">
                        <span style="color: var(--text-color); font-weight: 700; font-size: 12px;">120</span>
                    </div>
                    <span>${__("Lock")}</span>
                </div>

            </div>

        </div>
    `;
    container.html(legend_html);
}

Object.assign(project_workload_assignment.work_efforts, {
    get_project_roles,
    get_display_periods,
    addViewOptionsControl,
    render_legend,
});
