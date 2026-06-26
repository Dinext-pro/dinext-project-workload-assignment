/* ISS-2026-00709: рендер ячейки план + факт для PWR / Project Workload. */
frappe.provide("project_workload_assignment.planFactCell");

(function () {
	const PWR_PLAN_FACT_ROW_HEIGHT = 54;
	const PWR_DEFAULT_ROW_HEIGHT = 40;

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

	function isShowFactEnabled() {
		return !!window.pwrShowFact;
	}

	function getRowHeight(showFact) {
		return showFact ? PWR_PLAN_FACT_ROW_HEIGHT : PWR_DEFAULT_ROW_HEIGHT;
	}

	function renderPlanFactCell(options) {
		const opts = options || {};
		const planHours = parseFloat(opts.planHours) || 0;
		const actualHours = parseFloat(opts.actualHours) || 0;
		const showFact = opts.showFact != null ? !!opts.showFact : isShowFactEnabled();
		const availableHours = parseFloat(opts.availableHours) || 0;
		const percentage =
			availableHours > 0 ? Math.round((planHours / availableHours) * 100) : 0;
		const actualPct =
			availableHours > 0 ? Math.round((actualHours / availableHours) * 100) : 0;
		const planFill = Math.min(percentage, 100);
		const actualFill = Math.min(actualPct, 100);
		const cellClass = opts.cellClass || "projects-workload-cell";
		const prefix = opts.visualPrefix || "projects-workload";
		let visualizationClass = `${prefix}-visualization normal`;
		if (percentage > 120) {
			visualizationClass = `${prefix}-visualization overload`;
		} else if (percentage >= 95) {
			visualizationClass = `${prefix}-visualization warning`;
		}
		const tooltip = escapeHtml(
			opts.tooltip ||
				`${__("Plan")}: ${planHours.toFixed(1)}h (${percentage}%)` +
					(showFact
						? `\n${__("Actual")}: ${actualHours.toFixed(1)}h (${actualPct}%)`
						: "")
		);
		const planTextClass = planHours === 0 ? "workload-hours zero-load" : "workload-hours";
		const actualTextClass =
			actualHours === 0
				? "workload-hours zero-load pwr-actual-hours"
				: "workload-hours pwr-actual-hours";
		const planPctClass =
			planHours === 0 ? "workload-percentage zero-load" : "workload-percentage";
		const actualPctClass =
			actualHours === 0
				? "workload-percentage zero-load pwr-actual-pct"
				: "workload-percentage pwr-actual-pct";

		if (!showFact) {
			const planLayer = `<div class="${visualizationClass}" style="height:${planFill}%"></div>`;
			return `
				<div class="${cellClass}" title="${tooltip}">
					${planLayer}
					<div class="${prefix}-content">
						<div class="${planTextClass}">${formatHours(planHours)}</div>
						<div class="${prefix}-percentage ${planPctClass}">${percentage}%</div>
					</div>
				</div>
			`;
		}

		return `
			<div class="${cellClass} pwr-plan-fact-cell" title="${tooltip}">
				<div class="pwr-plan-fact-indicators">
					<div class="pwr-indicator-slot pwr-indicator-slot--plan">
						<div class="${visualizationClass} pwr-plan-fill" style="height:${planFill}%"></div>
					</div>
					<div class="pwr-indicator-slot pwr-indicator-slot--actual">
						<div class="${prefix}-visualization pwr-actual-fill" style="height:${actualFill}%"></div>
					</div>
				</div>
				<div class="${prefix}-content pwr-plan-fact-content">
					<div class="pwr-plan-fact-row pwr-plan-fact-row--hours">
						<div class="pwr-plan-fact-col pwr-plan-fact-col--plan">
							<span class="${planTextClass}">${formatHours(planHours)}</span>
						</div>
						<div class="pwr-plan-fact-col pwr-plan-fact-col--actual">
							<span class="${actualTextClass}">${formatHours(actualHours)}</span>
						</div>
					</div>
					<div class="pwr-plan-fact-row pwr-plan-fact-row--pct">
						<div class="pwr-plan-fact-col pwr-plan-fact-col--plan">
							<span class="${prefix}-percentage ${planPctClass}">${percentage}%</span>
						</div>
						<div class="pwr-plan-fact-col pwr-plan-fact-col--actual">
							<span class="${prefix}-percentage ${actualPctClass}">${actualPct}%</span>
						</div>
					</div>
				</div>
			</div>
		`;
	}

	project_workload_assignment.planFactCell = {
		isShowFactEnabled,
		renderPlanFactCell,
		getRowHeight,
		PWR_PLAN_FACT_ROW_HEIGHT,
		PWR_DEFAULT_ROW_HEIGHT,
	};
})();
