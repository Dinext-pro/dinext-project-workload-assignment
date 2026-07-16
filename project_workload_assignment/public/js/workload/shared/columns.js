import {
	formatPeriodHeader,
	resolveCurrentPeriodKey,
	CURRENT_PERIOD_HEADER_CLASS,
} from "./periods.js";
import { formatHoursCell } from "./format.js";
import { isHoliday } from "./holidays.js";
import { getAbsence, formatAbsenceText } from "./absences.js";

const PERIOD_COL_WIDTH = 72;

export function getParticipantColumn(opts) {
	const width = Number(opts?.width);
	const col = {
		field: "label",
		colId: "label",
		headerName: __("Участник"),
		minWidth: 200,
		pinned: "left",
		sortable: false,
	};
	if (Number.isFinite(width) && width > 0) {
		col.width = width;
	} else {
		col.flex = 1;
	}
	return col;
}

export function getStubColumns() {
	return [getParticipantColumn()];
}

function periodValueFormatter(periodKey) {
	return (params) => {
		if (params?.data?.kind === "absence") {
			const abs = getAbsence(params.data, periodKey);
			return abs ? formatAbsenceText(abs.type) : "";
		}
		return formatHoursCell(params);
	};
}

function periodCellClassRules(periodKey) {
	return {
		"workload-weekend-cell": (params) => isHoliday(params?.data, periodKey),
		"workload-absence-cell": (params) =>
			params?.data?.kind === "absence" && !!getAbsence(params.data, periodKey),
	};
}

export function getPeriodColumns(periods, opts) {
	const viewType = opts?.viewType;
	const currentKey = resolveCurrentPeriodKey(periods, viewType);
	return (periods || []).map((period) => {
		const key = period.key;
		const col = {
			field: `hours_${key}`,
			colId: `hours_${key}`,
			headerName: formatPeriodHeader(period, viewType),
			width: PERIOD_COL_WIDTH,
			minWidth: PERIOD_COL_WIDTH,
			maxWidth: PERIOD_COL_WIDTH,
			resizable: false,
			sortable: false,
			suppressMovable: true,
			type: "number",
			valueFormatter: periodValueFormatter(key),
			cellClassRules: periodCellClassRules(key),
		};
		if (currentKey && key === currentKey) {
			col.headerClass = CURRENT_PERIOD_HEADER_CLASS;
			col.isCurrentPeriod = true;
		}
		return col;
	});
}

export function getColumns(periods, opts) {
	return [
		getParticipantColumn({ width: opts?.participantWidth }),
		...getPeriodColumns(periods, opts),
	];
}
