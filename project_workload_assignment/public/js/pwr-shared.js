/* ISS-2026-00002: общие helpers/filters для PWR и Project Workload. */
frappe.provide("project_workload_assignment.pwrShared");

(function () {
	const NS = project_workload_assignment.pwrShared;
	let agGridPromise = null;

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
		$control.find(".form-group, .frappe-control, .control-input-wrapper, .control-input").css({
			marginBottom: 0,
			paddingBottom: 0,
		});
	}

	function createPwrPeriodNavFilter(container, frm, options) {
		const opts = options || {};
		const $nav = $(`
			<div class="pwr-chart-period-nav pwr-filter-period-nav">
				<button type="button" class="btn btn-xs btn-default pwr-chart-period-nav-btn pwr-chart-period-prev" title="${escapeHtml(__("Previous month"))}">&lt;</button>
				<button type="button" class="btn btn-xs btn-default pwr-chart-period-nav-btn pwr-chart-period-next" title="${escapeHtml(__("Next month"))}">&gt;</button>
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
			<div class="pwr-filter-field pwr-filter-worker-wtype">
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
			<div class="pwr-filter-field pwr-filter-show-fact">
				<label>
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
					["/assets/project_workload_assignment/js/projects-workload-ag-grid.js"],
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
		isPwrShowFactEnabled,
		getPwrLoadActualFlag,
		getPwrRowHeight,
		renderPwrPlanFactCell,
		getVisualizationClass,
		renderPlanOnlyWorkloadCell,
		getPwrPeriodAnchorLabel,
		triggerPwrWorkloadDataReload,
		compactPwrFilterControl,
		createPwrPeriodNavFilter,
		createPwrWorkerTypeFilter,
		createPwrShowFactFilter,
		ensureAgGrid,
	});
})();
