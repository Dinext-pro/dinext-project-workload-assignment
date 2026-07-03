/* ISS-2026-00002: общие helpers/filters для PWR и Project Workload. */
frappe.provide("project_workload_assignment.pwrShared");

(function () {
	const NS = project_workload_assignment.pwrShared;
	let agGridPromise = null;

	/** Frappe/Bootstrap 4 utilities for filter toolbar (keep pwr-* hooks for domain CSS). */
	const PWR_FILTER_BS = {
		row: "d-flex flex-nowrap align-items-start w-100",
		flow: "d-flex flex-wrap align-items-center",
		buttons: "d-flex flex-shrink-0 align-items-center justify-content-end",
		field: "d-flex align-items-center flex-shrink-0",
		label: "d-flex align-items-center mb-0",
		btn: "d-inline-flex align-items-center justify-content-center",
	};
	const PWR_FILTER_BTN_CLASS = "btn btn-default btn-sm " + PWR_FILTER_BS.btn;

	function escapeHtml(value) {
		return frappe.utils.escape_html(String(value == null ? "" : value));
	}

	function formatHours(value) {
		const hours = parseFloat(value);
		if (!Number.isFinite(hours) || hours <= 0) {
			return "0.0h";
		}
		return `${hours.toFixed(1)}h`;
	}

	function isPwrShowFactEnabled(frm) {
		if (window.pwrShowFact) {
			return true;
		}
		try {
			if (
				project_workload_assignment.charts &&
				typeof project_workload_assignment.charts.isShowFactEnabled === "function"
			) {
				return project_workload_assignment.charts.isShowFactEnabled(frm || window.cur_frm);
			}
		} catch (_e) {
			/* ignore */
		}
		return false;
	}

	function getPwrLoadActualFlag(options) {
		if (options && options.loadActual != null) {
			return options.loadActual ? 1 : 0;
		}
		return isPwrShowFactEnabled() ? 1 : 0;
	}

	function getPwrRowHeight() {
		if (
			project_workload_assignment.planFactCell &&
			typeof project_workload_assignment.planFactCell.getRowHeight === "function"
		) {
			return project_workload_assignment.planFactCell.getRowHeight(isPwrShowFactEnabled());
		}
		return isPwrShowFactEnabled() ? 54 : 40;
	}

	function renderPwrPlanFactCell(options) {
		if (
			project_workload_assignment.planFactCell &&
			typeof project_workload_assignment.planFactCell.renderPlanFactCell === "function"
		) {
			return project_workload_assignment.planFactCell.renderPlanFactCell(options);
		}
		return null;
	}

	function getVisualizationClass(visualPrefix, percentage) {
		const pct = Number(percentage) || 0;
		if (pct > 120) {
			return `${visualPrefix}-visualization overload`;
		}
		if (pct >= 95) {
			return `${visualPrefix}-visualization warning`;
		}
		return `${visualPrefix}-visualization normal`;
	}

	function renderPlanOnlyWorkloadCell(options) {
		const opts = options || {};
		const planHours = parseFloat(opts.planHours) || 0;
		const percentage = Number(opts.percentage) || 0;
		const visualPrefix = opts.visualPrefix || "projects-workload";
		const cellClass = opts.cellClass || `${visualPrefix}-cell`;
		const tooltip = escapeHtml(opts.tooltip || "");
		const fillHeight = Math.min(percentage, 100);
		const visualizationClass = getVisualizationClass(visualPrefix, percentage);
		const hoursClass = planHours === 0 ? "workload-hours zero-load" : "workload-hours";
		const percentageClass =
			planHours === 0 ? "workload-percentage zero-load" : "workload-percentage";

		return `
			<div class="${cellClass}" title="${tooltip}">
				<div class="${visualizationClass}" style="height:${fillHeight}%"></div>
				<div class="${visualPrefix}-content">
					<div class="${hoursClass}">${formatHours(planHours)}</div>
					<div class="${visualPrefix}-percentage ${percentageClass}">${percentage}%</div>
				</div>
			</div>
		`;
	}

	function getPwrPeriodAnchorLabel(frm, fallbackLabel) {
		if (
			project_workload_assignment.charts &&
			typeof project_workload_assignment.charts.getPeriodAnchorLabel === "function"
		) {
			return project_workload_assignment.charts.getPeriodAnchorLabel(frm || window.cur_frm);
		}
		if (typeof fallbackLabel === "function") {
			return fallbackLabel();
		}
		return frappe.datetime.str_to_user(
			window.pwrPeriodAnchorDate || frappe.datetime.get_today()
		);
	}

	function triggerPwrWorkloadDataReload(frm, extra) {
		const payload = Object.assign(
			{
				showFact: isPwrShowFactEnabled(),
				periodAnchor: window.pwrPeriodAnchorDate,
			},
			extra || {}
		);
		$(document).trigger("pwr-workload-data-reload", [frm || window.cur_frm, payload]);
	}

	function compactPwrFilterControl($control) {
		if (!$control || !$control.length) {
			return;
		}
		$control.find(".help-box, .clearfix").remove();
		$control
			.find(".form-group, .frappe-control, .control-input-wrapper, .control-input")
			.addClass("mb-0 pb-0");
	}

	function createPwrFilterRowShell($wrapper, options) {
		const opts = options || {};
		const extraRowClass = opts.extraRowClass || "";
		const controls = $(
			`<div class="projects-workload-controls unified-filters-row pwr-unified-filters-row ${PWR_FILTER_BS.row} ${extraRowClass}"></div>`
		).appendTo($wrapper);
		const $flow = $(`<div class="pwr-filters-flow ${PWR_FILTER_BS.flow}"></div>`).appendTo(
			controls
		);
		const $buttons = $(
			`<div class="pwr-filters-group pwr-filters-group--right filter-buttons ${PWR_FILTER_BS.buttons}"></div>`
		).appendTo(controls);
		return { controls, $flow, buttonsContainer: $buttons, $buttons };
	}

	function createPwrPeriodNavFilter(container, frm, options) {
		const opts = options || {};
		const $nav = $(`
			<div class="pwr-chart-period-nav pwr-filter-period-nav d-inline-flex align-items-center flex-shrink-0">
				<button type="button" class="btn btn-xs btn-default pwr-chart-period-nav-btn pwr-chart-period-prev ${PWR_FILTER_BS.btn}" title="${escapeHtml(__("Previous month"))}">&lt;</button>
				<button type="button" class="btn btn-xs btn-default pwr-chart-period-nav-btn pwr-chart-period-next ${PWR_FILTER_BS.btn}" title="${escapeHtml(__("Next month"))}">&gt;</button>
			</div>
		`).appendTo(container);

		const updateNavTitles = () => {
			const label = getPwrPeriodAnchorLabel(frm, opts.fallbackPeriodLabel);
			$nav
				.find(".pwr-chart-period-prev")
				.attr("title", `${__("Previous month")} (${label})`);
			$nav
				.find(".pwr-chart-period-next")
				.attr("title", `${__("Next month")} (${label})`);
		};

		if (frm) {
			frm._pwrUpdatePeriodNavLabel = updateNavTitles;
		}
		updateNavTitles();

		$nav.find(".pwr-chart-period-prev").on("click", function () {
			const activeFrm = frm || window.cur_frm;
			if (
				project_workload_assignment.charts &&
				typeof project_workload_assignment.charts.shiftPeriod === "function"
			) {
				project_workload_assignment.charts.shiftPeriod(activeFrm, -1);
			} else if (typeof opts.onShiftPeriod === "function") {
				opts.onShiftPeriod(activeFrm, -1);
			} else {
				window.pwrPeriodAnchorDate = frappe.datetime.add_months(
					window.pwrPeriodAnchorDate || frappe.datetime.get_today(),
					-1
				);
				triggerPwrWorkloadDataReload(activeFrm, opts.reloadPayload);
			}
			updateNavTitles();
		});

		$nav.find(".pwr-chart-period-next").on("click", function () {
			const activeFrm = frm || window.cur_frm;
			if (
				project_workload_assignment.charts &&
				typeof project_workload_assignment.charts.shiftPeriod === "function"
			) {
				project_workload_assignment.charts.shiftPeriod(activeFrm, 1);
			} else if (typeof opts.onShiftPeriod === "function") {
				opts.onShiftPeriod(activeFrm, 1);
			} else {
				window.pwrPeriodAnchorDate = frappe.datetime.add_months(
					window.pwrPeriodAnchorDate || frappe.datetime.get_today(),
					1
				);
				triggerPwrWorkloadDataReload(activeFrm, opts.reloadPayload);
			}
			updateNavTitles();
		});

		return $nav;
	}

	function createPwrWorkerTypeFilter(container, options) {
		const opts = options || {};
		const workerTypeLabel = __("Worker type");
		const $field = $(`
			<div class="pwr-filter-field pwr-filter-worker-wtype ${PWR_FILTER_BS.field}">
				<select class="form-control input-sm pwr-filter-worker-wtype-select" title="${escapeHtml(workerTypeLabel)}">
					<option value="">${escapeHtml(__("All"))}</option>
					<option value="Employee">${escapeHtml(__("Employee"))}</option>
					<option value="Supplier">${escapeHtml(__("Supplier"))}</option>
				</select>
			</div>
		`).appendTo(container);
		const $select = $field.find("select");
		$select.val(window.pwrWorkerWtype || "");
		$select.on("change", function () {
			window.pwrWorkerWtype = $(this).val() || "";
			const frm = window.cur_frm;
			if (
				project_workload_assignment.charts &&
				typeof project_workload_assignment.charts.setWorkerWtype === "function"
			) {
				project_workload_assignment.charts.setWorkerWtype(frm, window.pwrWorkerWtype);
			} else if (typeof opts.onChange === "function") {
				opts.onChange(frm, window.pwrWorkerWtype);
			} else {
				$(document).trigger("pwr-workload-chart-reload", [frm]);
				triggerPwrWorkloadDataReload(frm);
			}
		});
		return $field;
	}

	function createPwrShowFactFilter(container, options) {
		const opts = options || {};
		const showFactLabel = __("Show fact");
		const $field = $(`
			<div class="pwr-filter-field pwr-filter-show-fact ${PWR_FILTER_BS.field}">
				<label class="${PWR_FILTER_BS.label}">
					<input type="checkbox" class="pwr-filter-show-fact-checkbox" />
					<span>${escapeHtml(showFactLabel)}</span>
				</label>
			</div>
		`).appendTo(container);
		const $checkbox = $field.find("input");
		$checkbox.prop("checked", !!window.pwrShowFact);
		$checkbox.on("change", function () {
			window.pwrShowFact = !!this.checked;
			if (
				project_workload_assignment.charts &&
				typeof project_workload_assignment.charts.setShowFact === "function"
			) {
				project_workload_assignment.charts.setShowFact(window.cur_frm, window.pwrShowFact);
			} else if (typeof opts.onChange === "function") {
				opts.onChange(window.cur_frm, window.pwrShowFact);
			} else {
				triggerPwrWorkloadDataReload(window.cur_frm);
			}
		});
		return $field;
	}

	function ensureAgGrid() {
		if (window.ProjectsWorkloadAgGrid && typeof window.ProjectsWorkloadAgGrid.ensure === "function") {
			return Promise.resolve(window.ProjectsWorkloadAgGrid.ensure());
		}
		if (!agGridPromise) {
			agGridPromise = new Promise((resolve, reject) => {
				frappe.require(
					["/assets/project_workload_assignment/js/charts/ag-grid.js"],
					() => {
						if (
							!window.ProjectsWorkloadAgGrid ||
							typeof window.ProjectsWorkloadAgGrid.ensure !== "function"
						) {
							reject(new Error("ProjectsWorkloadAgGrid не загрузился"));
							return;
						}
						resolve(window.ProjectsWorkloadAgGrid.ensure());
					}
				);
			});
		}
		return agGridPromise;
	}

	Object.assign(NS, {
		PWR_FILTER_BS,
		PWR_FILTER_BTN_CLASS,
		isPwrShowFactEnabled,
		getPwrLoadActualFlag,
		getPwrRowHeight,
		renderPwrPlanFactCell,
		getVisualizationClass,
		renderPlanOnlyWorkloadCell,
		getPwrPeriodAnchorLabel,
		triggerPwrWorkloadDataReload,
		compactPwrFilterControl,
		createPwrFilterRowShell,
		createPwrPeriodNavFilter,
		createPwrWorkerTypeFilter,
		createPwrShowFactFilter,
		ensureAgGrid,
	});
})();
