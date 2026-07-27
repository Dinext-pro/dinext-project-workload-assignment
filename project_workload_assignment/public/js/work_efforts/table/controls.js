// we-table/controls.js — period helpers, legend, toolbar domain chrome
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
    frm.view_options = frm.view_options || __("Прогноз и факт");

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
            let is_past = (frm.view_options == __("Прогноз и факт"))
                ? frappe.datetime.obj_to_str(current) < month_start
                : (frm.view_options == __("Только факт"));
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
	frm.view_options = frm.view_options || __("Прогноз и факт");
	frappe.ui.form.make_control({
		parent: controls,
		df: {
			fieldtype: "Select",
			fieldname: "view-options",
			options: [
				__("Прогноз и факт"),
				__("Только прогноз"),
				__("Только факт"),
			],
			get_status: function () {
				return "Write";
			},
			change: function () {
				if (this.value == this.last_value) {
					return;
				}
				frm.we_periods = {};
				frm.view_options = this.value;
				project_workload_assignment.work_efforts.updateTable(
					frm,
					frm._we_period_type || "month",
					frm._we_unit || "hours"
				);
				project_workload_assignment.work_efforts.render_work_efforts_chart(frm);
				window.WorkEfforts.onViewOptionsChange(frm);
			},
		},
		value: frm.view_options,
		only_input: true,
		render_input: true,
	});
}

/**
 * Mount former shell controls into DinextTable toolbar custom host (once).
 * @param {WorkEffortsForm} frm
 * @param {JQuery} host
 */
function mount_toolbar_controls(frm, host) {
	if (host.data("we-controls-mounted")) {
		return;
	}
	host.data("we-controls-mounted", true);
	host.addClass("work-efforts-controls");

	const periodType = frm._we_period_type || "month";
	const unit = frm._we_unit || "hours";

	host.append(`
		<button class="btn btn-default" id="we_save_plan" type="button">${__("Сохранить план")}</button>
		<button class="btn btn-default" id="toggle_plan" type="button">${__("Показать план")}</button>
		<button class="btn btn-default" id="toggle_delta" type="button">${__("Показать Δ")}</button>
	`);

	addViewOptionsControl(frm, host);

	const checkbox_wrapper = $('<div class="assignments-checkbox-wrapper"></div>').appendTo(host);
	const assignments_checkbox = frappe.ui.form.make_control({
		parent: checkbox_wrapper,
		df: {
			fieldtype: "Check",
			fieldname: "show_assignments",
			label: __("Назначения"),
			onchange: function () {
				frm.show_assignments = this.get_value();
				const notifyWe = () => window.WorkEfforts.onAssignmentsToggle(frm);
				if (frm.show_assignments) {
					project_workload_assignment.work_efforts
						.load_all_assignments_if_needed(frm)
						.then(notifyWe);
				} else {
					notifyWe();
				}
			},
		},
		value: frm.show_assignments,
		only_input: false,
		render_input: true,
	});
	assignments_checkbox.refresh();

	host.append(`
		<div class="btn-group we-toolbar-check-group">
			<button class="btn btn-default dropdown-toggle" type="button" aria-haspopup="true" aria-expanded="false">
				${__("Проверить")} <span class="caret"></span>
			</button>
			<ul class="dropdown-menu dropdown-menu-right">
				<li id="check_plan_load">${__("Наличие плановых трудозатрат")}</li>
				<li id="check_workload_overload">${__("Загрузка превышает прогноз трудозатрат")}</li>
			</ul>
		</div>
	`);

	if (frm.hide_plan === undefined) {
		frm.hide_plan = true;
	}
	if (frm.hide_delta === undefined) {
		frm.hide_delta = true;
	}
	host.find("#toggle_plan").text(frm.hide_plan ? __("Показать план") : __("Скрыть план"));
	host.find("#toggle_delta").text(frm.hide_delta ? __("Показать Δ") : __("Скрыть Δ"));

	host.find("#we_save_plan").on("click", function () {
		window.WorkEfforts.saveForecastAsPlan(frm);
	});

	host.find("#toggle_plan").on("click", function () {
		frm.hide_plan = !frm.hide_plan;
		$(this).text(frm.hide_plan ? __("Показать план") : __("Скрыть план"));
		project_workload_assignment.work_efforts.updateTable(frm, periodType, unit);
		project_workload_assignment.work_efforts.render_work_efforts_chart(frm);
		window.WorkEfforts.onTogglePlanOrDelta(frm);
	});

	host.find("#toggle_delta").on("click", function () {
		frm.hide_delta = !frm.hide_delta;
		$(this).text(frm.hide_delta ? __("Показать Δ") : __("Скрыть Δ"));
		project_workload_assignment.work_efforts.updateTable(frm, periodType, unit);
		window.WorkEfforts.onTogglePlanOrDelta(frm);
	});

	host.find("#check_plan_load").on("click", function (e) {
		e.preventDefault();
		e.stopPropagation();
		window.WorkEfforts.runMissingPlanCheck(frm);
	});

	host.find("#check_workload_overload").on("click", function (e) {
		e.preventDefault();
		e.stopPropagation();
		project_workload_assignment.work_efforts.perform_overload_check(frm);
	});

	// Portal menu to body — toolbar/AG overflow clips in-place Bootstrap dropdown.
	bindCheckDropdownPortal(host.find(".we-toolbar-check-group"));
}

/**
 * Same idea as roles.js add-role menu: fixed menu on body escapes overflow clip.
 * @param {JQuery} $btnGroup
 */
function bindCheckDropdownPortal($btnGroup) {
	const $toggle = $btnGroup.find(".dropdown-toggle");
	const $menu = $btnGroup.find(".dropdown-menu");

	const closeMenu = () => {
		if (!$menu.parent().is(document.body)) {
			return;
		}
		$menu
			.hide()
			.removeClass("we-toolbar-check-menu")
			.appendTo($btnGroup)
			.css({
				display: "",
				position: "",
				top: "",
				left: "",
				right: "",
				width: "",
				zIndex: "",
			});
		$toggle.attr("aria-expanded", "false");
		document.removeEventListener("mousedown", onDocDown, true);
		window.removeEventListener("resize", closeMenu);
		window.removeEventListener("scroll", closeMenu, true);
	};

	const onDocDown = (event) => {
		if ($menu[0].contains(event.target) || $toggle[0].contains(event.target)) {
			return;
		}
		closeMenu();
	};

	const openMenu = () => {
		const rect = $toggle[0].getBoundingClientRect();
		// Clear BS `.dropdown-menu-right { right: 0 }` — with body + left it stretches full viewport.
		$menu
			.appendTo(document.body)
			.addClass("we-toolbar-check-menu")
			.css({
				display: "block",
				position: "fixed",
				top: rect.bottom + 2,
				right: "auto",
				width: "max-content",
				zIndex: 1050,
			});
		const menuWidth = $menu.outerWidth() || 220;
		let left = rect.right - menuWidth;
		if (left < 8) {
			left = 8;
		}
		$menu.css({ left });
		$toggle.attr("aria-expanded", "true");
		setTimeout(() => {
			document.addEventListener("mousedown", onDocDown, true);
			window.addEventListener("resize", closeMenu);
			window.addEventListener("scroll", closeMenu, true);
		}, 0);
	};

	$toggle.on("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		if ($menu.parent().is(document.body) && $menu.is(":visible")) {
			closeMenu();
			return;
		}
		openMenu();
	});

	$menu.on("click", "li", () => {
		closeMenu();
	});
}

/** @param {JQuery} container */
function render_legend(container) {
    let legend_html = `
        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 16px 24px; padding: 8px 12px; background: var(--fg-color); border: 1px solid var(--border-color); border-radius: 4px;">

            <!-- Плановые сроки -->
            <div style="display: flex; align-items: center; gap: 6px;">
                <div style="width: 16px; height: 16px; background-color: var(--we-period-plan-bg); border-radius: 2px; border: 1px solid var(--border-color);" class="we-legend-plan-swatch"></div>
                <span>${__("Плановые сроки задачи")}</span>
            </div>

            <!-- Прогнозные сроки -->
            <div style="display: flex; align-items: center; gap: 6px;">
                <div style="width: 16px; height: 16px; background-color: var(--we-period-forecast-bg); border-radius: 2px; border: 1px solid var(--border-color);" class="we-legend-forecast-swatch"></div>
                <span>${__("Прогнозные сроки задачи")}</span>
            </div>

            <!-- Загрузка -->
            <div style="display: flex; align-items: center; gap: 6px;">
                <div style="width: 16px; height: 16px; background-color: var(--we-period-forecast-bg); border-radius: 2px; border: 1px solid var(--border-color); position: relative;" class="we-legend-workload-swatch">
                    <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-image: radial-gradient(circle, #c8d0d8 1px, transparent 1px); background-size: 4px 4px; border-radius: 1px;"></div>
                </div>
                <span>${__("Загрузка")}</span>
            </div>

            <!-- Отсутствие плана -->
            <div style="display: flex; align-items: center; gap: 6px;">
                <div style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; background: var(--fg-color); border: 1px solid var(--border-color); border-radius: 2px;">
                    <span style="color: var(--alert-text-warning); font-weight: 700; font-size: 11px;">0</span>
                </div>
                <span>${__("Отсутствует план при наличии загрузки")}</span>
            </div>

            <!-- Новая строка с лимитами -->
            <div style="width: 100%; height: 1px; background: var(--border-color); margin: 4px 0;"></div>

            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 16px 24px; width: 100%;">

                <!-- Норма -->
                <div style="display: flex; align-items: center; gap: 6px;">
                    <div class="we-legend-limit-normal" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 22px; border-radius: 1px; background: var(--fg-color);">
                        <span style="color: var(--text-color); font-weight: 500; font-size: 12px;">85</span>
                    </div>
                    <span>${__("Норма")}</span>
                </div>

                <!-- Предупреждение -->
                <div style="display: flex; align-items: center; gap: 6px;">
                    <div class="we-legend-limit-warning" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 22px; border-radius: 1px; background: var(--fg-color);">
                        <span style="color: var(--text-color); font-weight: 600; font-size: 12px;">105</span>
                    </div>
                    <span>${__("Предупреждение")}</span>
                </div>

                <!-- Блокировка -->
                <div style="display: flex; align-items: center; gap: 6px;">
                    <div class="we-legend-limit-block" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 22px; border-radius: 1px; background: var(--fg-color);">
                        <span style="color: var(--text-color); font-weight: 700; font-size: 12px;">120</span>
                    </div>
                    <span>${__("Блокировка")}</span>
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
	mount_toolbar_controls,
	render_legend,
});
