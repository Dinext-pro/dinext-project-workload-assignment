/** Load fill on `.ag-cell` (cellClass / cellStyle); renderer = text only. */

const LOAD_LEVEL = {
	NORMAL: "normal",
	WARNING: "warning",
	OVERLOAD: "overload",
};

const resolveLoadLevel = (percentage) => {
	const pct = Number(percentage) || 0;
	if (pct > 120) return LOAD_LEVEL.OVERLOAD;
	if (pct >= 95) return LOAD_LEVEL.WARNING;
	return LOAD_LEVEL.NORMAL;
};

const formatHours = (value) => {
	const hours = parseFloat(value);
	if (!Number.isFinite(hours) || hours <= 0) return "0.0h";
	return `${hours.toFixed(1)}h`;
};

const buildFactTooltip = (baseTooltip, planHours, actualHours, percentage, actualPct) => {
	const lines = [];
	if (baseTooltip) lines.push(baseTooltip);
	else lines.push(`${__("Plan")}: ${planHours.toFixed(1)}h (${percentage}%)`);
	lines.push(`${__("Fact")}: ${actualHours.toFixed(1)}h (${actualPct}%)`);
	return lines.join("\n");
};

/** Visual model for one period cell (classes + CSS vars + text). */
export const resolvePeriodVisual = ({
	row,
	planHours,
	percentage,
	availableHours,
	tooltip,
	showFact,
	factHours,
	isWeekend,
	isAbsence,
	absenceLabel,
	weekendTooltip,
}) => {
	if (isAbsence) {
		return {
			kind: "absence",
			tooltip: absenceLabel || __("Absence"),
			label: __("Abs."),
		};
	}
	if (isWeekend) {
		return {
			kind: "weekend",
			tooltip: weekendTooltip || "",
		};
	}
	if (!row) {
		return { kind: "empty" };
	}

	const level = resolveLoadLevel(percentage);
	const fillPct = level === LOAD_LEVEL.OVERLOAD ? 100 : Math.min(percentage, 100);
	const actualHours = Number(factHours) || 0;
	const factFillPct =
		availableHours > 0 ? Math.min(Math.round((actualHours / availableHours) * 100), 100) : 0;
	const actualPct =
		availableHours > 0 ? Math.round((actualHours / availableHours) * 100) : 0;

	const displayHours = showFact && actualHours > 0 ? actualHours : planHours;
	const tip = showFact
		? buildFactTooltip(tooltip, planHours, actualHours, percentage, actualPct)
		: tooltip;

	return {
		kind: "load",
		level,
		fillPct,
		factFillPct,
		showFact: !!showFact,
		actualBelowPlan: actualHours > 0 && actualHours < planHours,
		hasActual: actualHours > 0,
		tooltip: tip,
		labelHours: formatHours(displayHours),
		labelPct: `${percentage}%`,
		zero: displayHours === 0,
	};
};

/** CSS vars on `.ag-cell` for gradient fill height. */
export const periodCellStyle = (visual) => {
	if (!visual || visual.kind !== "load") {
		return null;
	}
	const style = {
		"--wr-fill-h": `${visual.fillPct || 0}%`,
	};
	if (visual.showFact && visual.hasActual) {
		style["--wr-fact-h"] = `${visual.factFillPct || 0}%`;
	}
	return style;
};

/** Browser tooltip text (AG `tooltipValueGetter` + enableBrowserTooltips). */
export const periodTooltipValue = (visual) => {
	const tip = visual?.tooltip;
	return tip ? String(tip) : undefined;
};

/** Class list for period `.ag-cell` (incl. base `wr-period-cell`). */
export const periodCellClass = (visual) => {
	const classes = ["wr-period-cell"];
	if (!visual) return classes;

	if (visual.kind === "weekend") {
		classes.push("wr-cell--weekend");
		return classes;
	}
	if (visual.kind === "absence") {
		classes.push("wr-cell--absence");
		return classes;
	}
	if (visual.kind !== "load") {
		return classes;
	}

	classes.push(`wr-load--${visual.level}`);
	if (visual.showFact && visual.hasActual) {
		classes.push(visual.actualBelowPlan ? "wr-load--fact-below" : "wr-load--fact-above");
	}
	return classes;
};

/** Text-only content inside gridcell (tooltip via col tooltipValueGetter). */
export const renderPeriodContent = (visual) => {
	if (!visual || visual.kind === "empty" || visual.kind === "weekend") {
		return "";
	}

	const wrap = document.createElement("div");
	wrap.className = "wr-cell-content";

	if (visual.kind === "absence") {
		wrap.textContent = visual.label || __("Abs.");
		return wrap;
	}

	const hours = document.createElement("div");
	hours.className = visual.zero
		? "wr-cell-content__hours wr-cell-content__hours--zero"
		: "wr-cell-content__hours";
	hours.textContent = visual.labelHours;

	const pct = document.createElement("div");
	pct.className = visual.zero
		? "wr-cell-content__pct wr-cell-content__pct--zero"
		: "wr-cell-content__pct";
	pct.textContent = visual.labelPct;

	wrap.append(hours, pct);
	return wrap;
};
