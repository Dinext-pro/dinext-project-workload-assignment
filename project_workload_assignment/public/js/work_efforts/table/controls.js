// we-table/controls.js — period helpers + toolbar domain chrome + under-table legend
// ISS-2025-01239

import {
	VIEW_OPTION_FACT_ONLY,
	VIEW_OPTION_FORECAST_AND_FACT,
	VIEW_OPTION_FORECAST_ONLY,
	normalizeViewMode,
} from "../constants.js";
import { normalizeDeltaMode } from "../delta-mode.js";

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
    frm.view_options = frm.view_options || __(VIEW_OPTION_FORECAST_AND_FACT);

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
        const mode = normalizeViewMode(frm.view_options);
        while (frappe.datetime.obj_to_str(current) <= frappe.datetime.obj_to_str(end)) {
            let year = current.getFullYear();
            let i = current.getMonth();
            let is_past =
                mode === "forecast_only"
                    ? false
                    : mode === "fact_only"
                        ? true
                        : frappe.datetime.obj_to_str(current) < month_start;
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
	frm.view_options = frm.view_options || __(VIEW_OPTION_FORECAST_AND_FACT);
	frappe.ui.form.make_control({
		parent: controls,
		df: {
			fieldtype: "Select",
			fieldname: "view-options",
			options: [
				__(VIEW_OPTION_FORECAST_AND_FACT),
				__(VIEW_OPTION_FORECAST_ONLY),
				__(VIEW_OPTION_FACT_ONLY),
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
 * Toolbar Check control (label left of box — Frappe Check chrome).
 * @param {JQuery} host
 * @param {{ fieldname: string, label: string, value: number|boolean, onchange: Function }} opts
 */
function syncDeltaModeSegment(host, frm) {
	const hidden = !!frm.hide_delta;
	const mode = normalizeDeltaMode(frm.delta_mode);
	const $slot = host.find(".we-delta-mode-slot");
	const $mode = host.find(".we-delta-mode");
	if (!$slot.data("ready")) {
		$slot.addClass("no-anim");
	}
	$slot.toggleClass("is-open", !hidden);
	$slot.attr("aria-hidden", hidden ? "true" : "false");
	$mode.find(".we-delta-mode-btn").each(function () {
		const btn = $(this);
		const active = btn.attr("data-mode") === mode;
		btn.prop("disabled", hidden);
		btn.toggleClass("is-active", active);
		btn.attr("aria-pressed", active ? "true" : "false");
	});
	if (!$slot.data("ready")) {
		requestAnimationFrame(() => {
			$slot.removeClass("no-anim");
			$slot.data("ready", true);
		});
	}
}

function addDeltaModeSegment($parent, frm, $syncRoot) {
	const $slot = $(`
		<div class="we-delta-mode-slot" aria-hidden="true">
			<div class="we-delta-mode-slot-inner">
				<div class="we-delta-mode" role="group" aria-label="${__("Delta format")}">
					<button type="button" class="we-delta-mode-btn" data-mode="pct" aria-pressed="false">%</button>
					<button type="button" class="we-delta-mode-btn" data-mode="abs" aria-pressed="false">${__("abs")}</button>
				</div>
			</div>
		</div>
	`);
	$slot.on("click", ".we-delta-mode-btn", function () {
		if (!$slot.hasClass("is-open") || this.disabled) {
			return;
		}
		frm.delta_mode = normalizeDeltaMode(this.getAttribute("data-mode"));
		syncDeltaModeSegment($syncRoot, frm);
		window.WorkEfforts.onTogglePlanOrDelta(frm);
	});
	$slot.appendTo($parent);
	return $slot;
}

function addToolbarCheckbox(host, opts) {
	const wrapper = $('<div class="we-toolbar-checkbox-wrapper"></div>').appendTo(host);
	const control = frappe.ui.form.make_control({
		parent: wrapper,
		df: {
			fieldtype: "Check",
			fieldname: opts.fieldname,
			label: opts.label,
			onchange: opts.onchange,
		},
		value: opts.value,
		only_input: false,
		render_input: true,
	});
	control.refresh();
	return control;
}

/**
 * Sync Plan checkbox UI after code forces plan visible (e.g. missing-plan check).
 * @param {boolean} show
 */
function set_plan_checkbox(show) {
	const $input = $(".work-efforts-controls [data-fieldname='show_plan'] input[type='checkbox']");
	if ($input.length) {
		$input.prop("checked", !!show);
	}
}

/**
 * Mount former shell controls into DinextTable toolbar custom host (once).
 * Order: view mode → Check → Save plan → Plan → Δ [%|абс] → Assignments.
 * @param {WorkEffortsForm} frm
 * @param {JQuery} host
 */
function mount_toolbar_controls(frm, host) {
	if (host.data("we-controls-mounted")) {
		syncDeltaModeSegment(host, frm);
		return;
	}
	host.data("we-controls-mounted", true);
	host.addClass("work-efforts-controls");

	const periodType = frm._we_period_type || "month";
	const unit = frm._we_unit || "hours";

	addViewOptionsControl(frm, host);

	host.append(`
		<div class="btn-group we-toolbar-check-group">
			<button class="btn btn-default dropdown-toggle" type="button" aria-haspopup="true" aria-expanded="false">
				${__("Check")} <span class="caret"></span>
			</button>
			<ul class="dropdown-menu dropdown-menu-right">
				<li id="check_plan_load">${__("Presence of planned work efforts")}</li>
				<li id="check_workload_overload">${__("Workload exceeds forecast work efforts")}</li>
			</ul>
		</div>
	`);

	host.append(`
		<button class="btn btn-default we-save-plan-btn" id="we_save_plan" type="button"
			title="${__("Save plan")}" aria-label="${__("Save plan")}">
			<i class="fa fa-save" aria-hidden="true"></i>
			<span class="we-save-plan-label">${__("Plan")}</span>
		</button>
	`);

	// Defaults set in render.js ensureWeDefaults before mount.
	addToolbarCheckbox(host, {
		fieldname: "show_plan",
		label: __("Plan"),
		value: !frm.hide_plan,
		onchange: function () {
			frm.hide_plan = !this.get_value();
			project_workload_assignment.work_efforts.updateTable(frm, periodType, unit);
			project_workload_assignment.work_efforts.render_work_efforts_chart(frm);
			window.WorkEfforts.onTogglePlanOrDelta(frm);
		},
	});

	const $delta = $('<div class="we-delta-group"></div>').appendTo(host);
	addToolbarCheckbox($delta, {
		fieldname: "show_delta",
		label: __("Δ"),
		value: !frm.hide_delta,
		onchange: function () {
			frm.hide_delta = !this.get_value();
			syncDeltaModeSegment(host, frm);
			project_workload_assignment.work_efforts.updateTable(frm, periodType, unit);
			window.WorkEfforts.onTogglePlanOrDelta(frm);
		},
	});
	addDeltaModeSegment($delta, frm, host);
	syncDeltaModeSegment(host, frm);

	addToolbarCheckbox(host, {
		fieldname: "show_assignments",
		// Context: dinext_projects "Assignments"→«Поручения» without context
		label: __("Assignments", null, "Work Efforts"),
		value: frm.show_assignments,
		onchange: function () {
			frm.show_assignments = this.get_value();
			// onAssignmentsToggle loads assignment cache itself when needed
			window.WorkEfforts.onAssignmentsToggle(frm);
		},
	});

	host.find("#we_save_plan").on("click", function () {
		window.WorkEfforts.saveForecastAsPlan(frm);
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
 * Portal host for overlays. Native fullscreen only paints fullscreenElement subtree —
 * body / #body portals are invisible there.
 * @returns {HTMLElement}
 */
function get_portal_host() {
	return (
		document.fullscreenElement ||
		document.webkitFullscreenElement ||
		document.mozFullScreenElement ||
		document.msFullscreenElement ||
		document.body
	);
}

const OVERLAY_SELECTOR =
	"#freeze, #dialog-container, .modal, .modal-backdrop, .frappe-toast-area, .awesomplete > ul";

let _overlayWatchObserver = null;
let _overlayWatchRaf = null;

/**
 * Move desk overlays (modals, freeze, toasts) into the fullscreen element so they
 * remain visible while Work Efforts table is in native fullscreen.
 * @param {JQuery|HTMLElement|string} [selector]
 */
function bring_overlays_into_fullscreen(selector) {
	const host = get_portal_host();
	if (!host || host === document.body) {
		return;
	}
	const $nodes = selector ? $(selector) : $(OVERLAY_SELECTOR);
	$nodes.each(function () {
		if (!this || !this.parentNode) {
			return;
		}
		if (host.contains(this) && this.parentNode === host) {
			return;
		}
		// Prefer moving the .modal root (frappe.ui.Dialog.$wrapper), not an inner node.
		const modalRoot = this.classList?.contains("modal")
			? this
			: this.closest?.(".modal");
		const node = modalRoot && modalRoot !== host ? modalRoot : this;
		if (node.parentNode !== host) {
			host.appendChild(node);
		}
		if (node.classList?.contains("modal")) {
			node.style.zIndex = "10050";
		}
		if (node.classList?.contains("modal-backdrop")) {
			node.style.zIndex = "10040";
		}
	});
	// Custom colored tooltip must live in fullscreen host too
	project_workload_assignment.work_efforts.initCustomTooltip?.();
}

/** Watch body for late-mounted Dialog / backdrop while table is fullscreen. */
function start_fullscreen_overlay_watch() {
	stop_fullscreen_overlay_watch();
	bring_overlays_into_fullscreen();
	const schedule = () => {
		if (_overlayWatchRaf) cancelAnimationFrame(_overlayWatchRaf);
		_overlayWatchRaf = requestAnimationFrame(() => {
			_overlayWatchRaf = null;
			bring_overlays_into_fullscreen();
		});
	};
	_overlayWatchObserver = new MutationObserver(schedule);
	_overlayWatchObserver.observe(document.body, { childList: true, subtree: true });
	// Catch Bootstrap append after dialog.show()
	[0, 50, 150, 300].forEach((ms) => setTimeout(bring_overlays_into_fullscreen, ms));
}

function stop_fullscreen_overlay_watch() {
	if (_overlayWatchObserver) {
		_overlayWatchObserver.disconnect();
		_overlayWatchObserver = null;
	}
	if (_overlayWatchRaf) {
		cancelAnimationFrame(_overlayWatchRaf);
		_overlayWatchRaf = null;
	}
}

/**
 * Same idea as roles.js add-role menu: fixed menu escapes overflow clip.
 * Host = fullscreenElement when active, else body.
 * @param {JQuery} $btnGroup
 */
function bindCheckDropdownPortal($btnGroup) {
	const $toggle = $btnGroup.find(".dropdown-toggle");
	const $menu = $btnGroup.find(".dropdown-menu");
	const isPortaled = () => !$menu.parent().is($btnGroup);

	const closeMenu = () => {
		if (!isPortaled()) {
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
		// Clear BS `.dropdown-menu-right { right: 0 }` — with portal + left it stretches full viewport.
		$menu
			.appendTo(get_portal_host())
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
		if (isPortaled() && $menu.is(":visible")) {
			closeMenu();
			return;
		}
		openMenu();
	});

	$menu.on("click", "li", () => {
		closeMenu();
	});
}

/** Under-table legend (sticky/original parity — not toolbar popover). */
function render_legend(container) {
	container.html(`
		<div class="we-legend-panel we-legend-panel--inline">
			<div class="we-legend-row">
				<div class="we-legend-swatch we-legend-plan-swatch"></div>
				<span>${__("Planned Task Dates")}</span>
			</div>
			<div class="we-legend-row">
				<div class="we-legend-swatch we-legend-forecast-swatch"></div>
				<span>${__("Forecast Task Dates")}</span>
			</div>
			<div class="we-legend-row">
				<div class="we-legend-swatch we-legend-workload-swatch">
					<div class="we-legend-workload-dots"></div>
				</div>
				<span>${__("Workload")}</span>
			</div>
			<div class="we-legend-row">
				<div class="we-legend-swatch we-legend-missing-plan">
					<span>0</span>
				</div>
				<span>${__("Plan is missing while workload is present")}</span>
			</div>
			<div class="we-legend-sep"></div>
			<div class="we-legend-limits">
				<div class="we-legend-row">
					<div class="we-legend-limit we-legend-limit-normal"><span>85</span></div>
					<span>${__("Norm")}</span>
				</div>
				<div class="we-legend-row">
					<div class="we-legend-limit we-legend-limit-warning"><span>105</span></div>
					<span>${__("Warning")}</span>
				</div>
				<div class="we-legend-row">
					<div class="we-legend-limit we-legend-limit-block"><span>120</span></div>
					<span>${__("Lock")}</span>
				</div>
			</div>
		</div>
	`);
}

Object.assign(project_workload_assignment.work_efforts, {
	get_project_roles,
	get_display_periods,
	mount_toolbar_controls,
	set_plan_checkbox,
	render_legend,
	get_portal_host,
	bring_overlays_into_fullscreen,
	start_fullscreen_overlay_watch,
	stop_fullscreen_overlay_watch,
});
