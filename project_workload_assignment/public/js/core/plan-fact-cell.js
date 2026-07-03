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

	function enrichWorkloadTooltip(baseTooltip, percentage) {
		if (!baseTooltip) {
			return null;
		}
		return String(baseTooltip)
			.trim()
			.split("\n")
			.map((line) => {
				if (/Workload.*:\s*[\d.]+h\s*\(\d+%\)/.test(line)) {
					return line;
				}
				const match = line.match(/^(.+Workload.+?:\s*)([\d.]+h)\s*$/);
				if (match) {
					return `${match[1]}${match[2]} (${percentage}%)`;
				}
				if (/Load percentage:/.test(line)) {
					return null;
				}
				return line;
			})
			.filter(Boolean)
			.join("\n");
	}

	function buildCellTooltip(planHours, actualHours, percentage, actualPct, showFact, baseTooltip) {
		const lines = [];
		const enrichedTooltip = enrichWorkloadTooltip(baseTooltip, percentage);
		if (enrichedTooltip) {
			lines.push(enrichedTooltip);
		} else {
			lines.push(`${__("Plan")}: ${planHours.toFixed(1)}h (${percentage}%)`);
		}
		if (showFact) {
			lines.push(`${__("Fact")}: ${actualHours.toFixed(1)}h (${actualPct}%)`);
		}
		return escapeHtml(lines.join("\n"));
	}

	function buildPlanFactLayers(
		actualHours,
		actualFill,
		actualBelowPlan,
		planFill,
		visualizationClass
	) {
		const planFillLayer = `<div class="${visualizationClass} pwr-plan-fill" style="height:${planFill}%"></div>`;
		if (actualHours <= 0) {
			return planFillLayer;
		}
		const actualFillLayer = `<div class="pwr-actual-fill" style="height:${actualFill}%"></div>`;
		if (actualBelowPlan) {
			return planFillLayer + actualFillLayer;
		}
		const planMarkerLayer = `<div class="${visualizationClass} pwr-plan-marker" style="bottom:${planFill}%"></div>`;
		return actualFillLayer + planMarkerLayer;
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
		const actualBelowPlan = actualHours < planHours;
		const cellClass = opts.cellClass || "projects-workload-cell";
		const prefix = opts.visualPrefix || "projects-workload";
		let visualizationClass = `${prefix}-visualization normal`;
		if (percentage > 120) {
			visualizationClass = `${prefix}-visualization overload`;
		} else if (percentage >= 95) {
			visualizationClass = `${prefix}-visualization warning`;
		}
		const tooltip = buildCellTooltip(
			planHours,
			actualHours,
			percentage,
			actualPct,
			showFact,
			opts.tooltip
		);
		const planTextClass = planHours === 0 ? "workload-hours zero-load" : "workload-hours";
		const planPctClass =
			planHours === 0 ? "workload-percentage zero-load" : "workload-percentage";
		const displayHours = showFact && actualHours > 0 ? actualHours : planHours;
		const displayTextClass =
			displayHours === 0 ? "workload-hours zero-load" : "workload-hours";

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

		const indicatorLayers = buildPlanFactLayers(
			actualHours,
			actualFill,
			actualBelowPlan,
			planFill,
			visualizationClass
		);

		return `
			<div class="${cellClass} pwr-plan-fact-cell" title="${tooltip}">
				<div class="pwr-plan-fact-indicators pwr-plan-fact-indicators--full">
					${indicatorLayers}
				</div>
				<div class="${prefix}-content pwr-plan-fact-content">
					<div class="${displayTextClass}">${formatHours(displayHours)}</div>
					<div class="${prefix}-percentage ${planPctClass}">${percentage}%</div>
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
