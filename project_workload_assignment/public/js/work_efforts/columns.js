import { MERGE_GROUP, SUMMARY_ROW_ID } from "./constants.js";
import { actualCellClassRules } from "./limits.js";
import { roleCellRenderer } from "./roles.js";
import { assignmentsCellRenderer } from "./assignments.js";
import {
    missingPlanCellClassRules,
    missingPlanRoleClassRules,
    missingPlanTaskClassRules,
} from "./plan_check.js";
import {
    actualPeriodClassRules,
    deltaPeriodClassRules,
    planPeriodClassRules,
} from "./period-markers.js";

/** Legacy period group width (StickyDataTable getter: 200 − 65 per hidden subcol). */
const LEGACY_PERIOD_GROUP_WIDTH = 200;
const LEGACY_HIDDEN_SUBCOL_WIDTH = 65;

const ALIGN_CENTER = "dinext-table-cell--align-center";
const HEADER_CENTER = "we-header--center";
const CELL_ZERO = "we-cell--zero";

/** Match legacy group width shared equally across visible plan/actual/delta. */
function periodLeafWidth(hidePlan, hideDelta) {
    let group = LEGACY_PERIOD_GROUP_WIDTH;
    if (hidePlan) group -= LEGACY_HIDDEN_SUBCOL_WIDTH;
    if (hideDelta) group -= LEGACY_HIDDEN_SUBCOL_WIDTH;
    const visible = 1 + (hidePlan ? 0 : 1) + (hideDelta ? 0 : 1);
    return Math.round(group / visible);
}

function toNumber(value) {
    const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
    return Number.isFinite(n) ? n : null;
}

/** Non-zero → 1 decimal; zero → bare "0" (legacy muted via cellClassRules). */
function formatNumber(params) {
    const n = toNumber(params.value);
    if (n == null) return "";
    if (n === 0) return "0";
    return n.toFixed(1);
}

function formatDelta(params) {
    const n = toNumber(params.value);
    if (n == null) return "";
    if (n === 0) return "0";
    return `${n.toFixed(1)}%`;
}

function isZeroValue(params) {
    const n = toNumber(params.value);
    return n != null && n === 0;
}

const ZERO_CELL_CLASS_RULES = {
    [CELL_ZERO]: isZeroValue,
};

function isSerialHead(row) {
    if (!row?.task_id || row.merge_group_id === SUMMARY_ROW_ID) {
        return false;
    }
    if (row.merge_group_size >= 2 && row.merge_group_index > 0) {
        return false;
    }
    return row.merge_group_index === 0 || row.merge_group_index == null;
}

/**
 * Legacy DataTable serialNoColumn = index+1 over the full task list
 * (collapsed children still occupy a number). Walk source tree DFS, not
 * only currently displayed AG Grid rows.
 */
function buildTaskSerialMap(rows) {
    const map = new Map();
    let serial = 0;

    function walk(list) {
        for (const row of list || []) {
            if (isSerialHead(row) && !map.has(row.task_id)) {
                serial += 1;
                map.set(row.task_id, serial);
            }
            if (row.children?.length) {
                walk(row.children);
            }
        }
    }

    walk(rows);
    return map;
}

function serialValueGetter(params) {
    const data = params.data;
    if (!isSerialHead(data)) {
        return "";
    }

    const sourceRows =
        params.context?.dinextTable?.sourceData ||
        params.context?.dinextTable?.options?.data ||
        [];
    const map = buildTaskSerialMap(sourceRows);
    return map.get(data.task_id) ?? "";
}

function fixedWidth(width) {
    return {
        width,
        minWidth: width,
        maxWidth: width,
        resizable: false,
        suppressSizeToFit: true,
    };
}

function mergeClassList(existing, next) {
    if (!existing) {
        return next;
    }
    if (typeof existing === "string") {
        return `${existing} ${next}`;
    }
    if (Array.isArray(existing)) {
        return [...existing, next];
    }
    return existing;
}

function withCenterAlign(col) {
    return {
        ...col,
        cellClass: mergeClassList(col.cellClass, ALIGN_CENTER),
        // AG has no headerAlign prop; headerClass + CSS. Beats number data-type right header.
        headerClass: mergeClassList(col.headerClass, HEADER_CENTER),
    };
}

function sumPeriodField(row, periods, fieldPrefix) {
    let sum = 0;
    for (const period of periods || []) {
        sum += Number(row?.[`${fieldPrefix}_${period.key}`]) || 0;
    }
    return sum;
}

function totalPlanGetter(periods) {
    return (params) => sumPeriodField(params.data, periods, "plan");
}

function totalActualGetter(periods) {
    return (params) => sumPeriodField(params.data, periods, "actual");
}

function totalDeltaGetter(periods) {
    return (params) => {
        const plan = sumPeriodField(params.data, periods, "plan");
        const actual = sumPeriodField(params.data, periods, "actual");
        if (!plan) return 0;
        return Math.round(((actual - plan) / plan) * 1000) / 10;
    };
}

function buildPeriodLeaf(opts) {
    const { field, colId, headerName, width, hide, edit, valueFormatter, valueGetter, cellClassRules } =
        opts;
    const col = withCenterAlign({
        field,
        colId,
        headerName,
        ...fixedWidth(width),
        sortable: false,
        suppressMovable: true,
        tree: false,
        type: "number",
        hide: !!hide,
        valueFormatter,
        cellClassRules: {
            ...ZERO_CELL_CLASS_RULES,
            ...(cellClassRules || {}),
        },
    });
    if (edit !== undefined) col.edit = edit;
    if (valueGetter) col.valueGetter = valueGetter;
    return col;
}

function buildPeriodColumns(frm, periods) {
    const hidePlan = !!frm.hide_plan;
    const hideDelta = !!frm.hide_delta;
    const leafWidth = periodLeafWidth(hidePlan, hideDelta);

    return (periods || []).map((period) => {
        const key = period.key;
        const actualLabel = period.is_past ? __("Факт") : __("Прогноз");

        return {
            colId: `period_${key}`,
            headerName: `${period.year} ${period.month}`,
            headerClass: HEADER_CENTER,
            marryChildren: true,
            children: [
                buildPeriodLeaf({
                    field: `plan_${key}`,
                    colId: `plan_${key}`,
                    headerName: __("План"),
                    width: leafWidth,
                    hide: hidePlan,
                    valueFormatter: formatNumber,
                    cellClassRules: {
                        ...planPeriodClassRules(frm, period),
                        ...missingPlanCellClassRules(frm, period),
                    },
                }),
                buildPeriodLeaf({
                    field: `actual_${key}`,
                    colId: `actual_${key}`,
                    headerName: actualLabel,
                    width: leafWidth,
                    edit: (row) => !period.is_past && row?.merge_group_id !== SUMMARY_ROW_ID,
                    valueFormatter: formatNumber,
                    cellClassRules: {
                        ...actualPeriodClassRules(frm, period),
                        ...actualCellClassRules(frm, period),
                    },
                }),
                buildPeriodLeaf({
                    field: `delta_${key}`,
                    colId: `delta_${key}`,
                    headerName: "Δ",
                    width: leafWidth,
                    hide: hideDelta,
                    valueFormatter: formatDelta,
                    cellClassRules: deltaPeriodClassRules(frm, period),
                }),
            ],
        };
    });
}

/** Legacy column `total` — sum of plan/actual/Δ across displayed periods. */
function buildTotalColumn(frm, periods) {
    const hidePlan = !!frm.hide_plan;
    const hideDelta = !!frm.hide_delta;
    const leafWidth = periodLeafWidth(hidePlan, hideDelta);

    return {
        colId: "total",
        headerName: __("Итого"),
        headerClass: HEADER_CENTER,
        marryChildren: true,
        children: [
            buildPeriodLeaf({
                field: "total_plan",
                colId: "total_plan",
                headerName: __("План"),
                width: leafWidth,
                hide: hidePlan,
                valueGetter: totalPlanGetter(periods),
                valueFormatter: formatNumber,
            }),
            buildPeriodLeaf({
                field: "total_actual",
                colId: "total_actual",
                headerName: __("Прогноз"),
                width: leafWidth,
                valueGetter: totalActualGetter(periods),
                valueFormatter: formatNumber,
            }),
            buildPeriodLeaf({
                field: "total_delta",
                colId: "total_delta",
                headerName: "Δ",
                width: leafWidth,
                hide: hideDelta,
                valueGetter: totalDeltaGetter(periods),
                valueFormatter: formatDelta,
            }),
        ],
    };
}

export function getColumns(frm, periods) {
    const spanRows = DinextTable.createMergeGroupSpanRows({ mergeGroup: MERGE_GROUP });
    const form = frm || (typeof cur_frm !== "undefined" ? cur_frm : null);
    const periodList = periods || form?.we?.periods || [];

    const baseColumns = [
        {
            field: "_selected",
            colId: "_selected",
            headerName: "",
            headerClass: HEADER_CENTER,
            ...fixedWidth(36),
            sortable: false,
            suppressMovable: true,
            pinned: "left",
            tree: false,
            type: "checkbox",
            edit: true,
            spanRows,
            // centering: core .dinext-table-cell--align-center (checkbox preset)
        },
        withCenterAlign({
            field: "task_serial",
            colId: "task_serial",
            headerName: "#",
            ...fixedWidth(40),
            sortable: false,
            suppressMovable: true,
            pinned: "left",
            tree: false,
            spanRows,
            valueGetter: serialValueGetter,
        }),
        {
            field: "task_subject",
            headerName: __("Задачи"),
            headerClass: HEADER_CENTER,
            flex: 1,
            minWidth: 250,
            pinned: "left",
            tree: true,
            spanRows,
            cellClassRules: missingPlanTaskClassRules(form || {}),
        },
        {
            field: "role",
            headerName: __("Роли"),
            headerClass: HEADER_CENTER,
            width: 220,
            minWidth: 180,
            pinned: "left",
            tree: false,
            sortable: false,
            suppressMovable: true,
            cellRenderer: roleCellRenderer(form || {}),
            cellClassRules: missingPlanRoleClassRules(form || {}),
        },
        withCenterAlign({
            field: "assignments",
            colId: "assignments",
            headerName: __("Назначения"),
            width: 95,
            minWidth: 80,
            maxWidth: 120,
            pinned: "left",
            tree: false,
            sortable: false,
            suppressMovable: true,
            hide: !(form && form.show_assignments),
            cellRenderer: assignmentsCellRenderer(form || {}),
        }),
    ];

    return [...baseColumns, ...buildPeriodColumns(form || {}, periodList), buildTotalColumn(form || {}, periodList)];
}

export function refreshColumns(frm) {
    const state = frm.we;
    if (!state?.table?.setOption) {
        return;
    }
    state.table.setOption("columns", getColumns(frm, state.periods));
}

/** Toggle plan/Δ: rebuild columns so leaf widths match legacy group (200 − 65×hidden). */
export function applyPlanDeltaVisibility(frm) {
    refreshColumns(frm);
}
