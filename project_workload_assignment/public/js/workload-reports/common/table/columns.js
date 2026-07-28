import {
	periodHeaderParts,
	resolveCurrentPeriodKey,
	CURRENT_PERIOD_HEADER_CLASS,
} from "./periods.js";
import { periodDateKey, isHoliday } from "./holidays.js";
import { getAbsence } from "./absences.js";
import { resolvePeriodLoad } from "./capacity.js";
import {
	resolvePeriodVisual,
	periodCellStyle,
	periodCellClass,
	periodTooltipValue,
	renderPeriodContent,
} from "./fill.js";
import { renderParticipant } from "./participant.js";
import {
	isNavigableAbsencePeriod,
	isNavigableProject,
	NAV_POINTER_CLASS,
} from "./navigation.js";

export const CELL_SIZE = 48;
export const getRowHeight = () => CELL_SIZE;

const _num = (value) => {
	const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
	return Number.isFinite(n) ? n : 0;
};

const _holidayTooltip = (row, dateKey) => {
	const userHit = (row.userHolidays || []).some((h) => h?.date === dateKey);
	const projectHit = (row.projectHolidays || []).some((h) => h?.date === dateKey);
	if (userHit && projectHit) return __("Project & User Holiday");
	if (userHit) return __("User Holiday");
	return __("Project Holiday");
};

const _resolveVisual = (period, dateKey, viewType, showFact, params) => {
	const row = params?.data;
	if (!row) return resolvePeriodVisual({ row: null });

	if (row.kind === "absence") {
		const absence = getAbsence(row, dateKey);
		if (!absence) return resolvePeriodVisual({ row: null });
		return resolvePeriodVisual({
			row,
			isAbsence: true,
			absenceLabel: absence.type || __("Absence"),
		});
	}

	if (viewType === "daily" && dateKey && isHoliday(row, dateKey)) {
		return resolvePeriodVisual({
			row,
			isWeekend: true,
			weekendTooltip: _holidayTooltip(row, dateKey),
		});
	}

	const planHours = _num(params?.value);
	const { availableHours, percentage, tooltip } = resolvePeriodLoad(
		row,
		period,
		planHours,
		viewType
	);
	const factHours = _num(row[`fact_hours_${period.key}`]);

	return resolvePeriodVisual({
		row,
		planHours,
		percentage,
		availableHours,
		tooltip,
		showFact,
		factHours,
	});
};

const _periodCellRenderer = (period, dateKey, viewType, showFact) => (params) =>
	renderPeriodContent(_resolveVisual(period, dateKey, viewType, showFact, params));

const _periodCellStyle = (period, dateKey, viewType, showFact) => (params) =>
	periodCellStyle(_resolveVisual(period, dateKey, viewType, showFact, params));

const _periodCellClass = (period, dateKey, viewType, showFact) => (params) => {
	const classes = periodCellClass(
		_resolveVisual(period, dateKey, viewType, showFact, params)
	);
	const row = params?.data;
	if (isNavigableProject(row) || isNavigableAbsencePeriod(row)) {
		classes.push(NAV_POINTER_CLASS);
	}
	return classes;
};

const _periodTooltipValue = (period, dateKey, viewType, showFact) => (params) =>
	periodTooltipValue(_resolveVisual(period, dateKey, viewType, showFact, params));

export const getLabelColumn = () => ({
	field: "label",
	colId: "label",
	headerName: __("Member"),
	tree: true,
	minWidth: 200,
	pinned: "left",
	flex: 1,
	sortable: false,
	render: renderParticipant,
	cellClass: (params) =>
		isNavigableProject(params?.data) ? NAV_POINTER_CLASS : undefined,
});

export const getColumns = (periods, opts = {}) => {
	const viewType = opts.viewType;
	const showFact = !!opts.showFact;
	const currentKey = resolveCurrentPeriodKey(periods, viewType);

	const periodCols = (periods || []).map((period) => {
		const key = period.key;
		const dateKey = periodDateKey(period);
		const { top, bottom } = periodHeaderParts(period, viewType);
		const isCurrent = currentKey && key === currentKey;

		const leaf = {
			field: `hours_${key}`,
			colId: `hours_${key}`,
			headerName: bottom,
			width: CELL_SIZE,
			minWidth: CELL_SIZE,
			maxWidth: CELL_SIZE,
			resizable: false,
			sortable: false,
			suppressMovable: true,
			cellClass: _periodCellClass(period, dateKey, viewType, showFact),
			cellRenderer: _periodCellRenderer(period, dateKey, viewType, showFact),
			cellStyle: _periodCellStyle(period, dateKey, viewType, showFact),
			tooltipValueGetter: _periodTooltipValue(period, dateKey, viewType, showFact),
		};
		if (isCurrent) {
			leaf.headerClass = CURRENT_PERIOD_HEADER_CLASS;
		}

		const group = {
			headerName: top,
			marryChildren: true,
			children: [leaf],
		};
		if (isCurrent) {
			group.headerClass = CURRENT_PERIOD_HEADER_CLASS;
		}
		return group;
	});

	return [getLabelColumn(), ...periodCols];
};
