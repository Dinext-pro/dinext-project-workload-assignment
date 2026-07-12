import { MERGE_GROUP, SUMMARY_ROW_ID } from "./constants.js";
import { actualCellClassRules } from "./limits.js";
import { roleCellRenderer } from "./roles.js";
import { assignmentsCellRenderer } from "./assignments.js";
import {
    missingPlanCellClassRules,
    missingPlanRoleClassRules,
    missingPlanTaskClassRules,
} from "./checks.js";
import {
    actualPeriodClassRules,
    deltaPeriodClassRules,
    planPeriodClassRules,
} from "./period-markers.js";

/** Fixed period sub-column width — legacy group ~200px / 3 (+ AG Grid padding). */
const PERIOD_COL_WIDTH = 72;

const ALIGN_CENTER = "dinext-table-cell--align-center";

function formatNumber(params) {
    const value = params.value;
    if (value == null || value === "") return "";
    return Number(value).toFixed(0);
}

function formatDelta(params) {
    const value = params.value;
    if (value == null || value === "") return "";
    return `${Number(value).toFixed(1)}%`;
}

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

function withCenterAlign(col) {
    const existing = col.cellClass;
    if (!existing) {
        return { ...col, cellClass: ALIGN_CENTER };
    }
    if (typeof existing === "string") {
        return { ...col, cellClass: `${existing} ${ALIGN_CENTER}` };
    }
    if (Array.isArray(existing)) {
        return { ...col, cellClass: [...existing, ALIGN_CENTER] };
    }
    return col;
}

function buildPeriodColumns(frm, periods) {
    const hidePlan = !!frm.hide_plan;
    const hideDelta = !!frm.hide_delta;

    return (periods || []).map((period) => {
        const key = period.key;
        const actualLabel = period.is_past ? __("Факт") : __("Прогноз");

        return {
            colId: `period_${key}`,
            headerName: `${period.year} ${period.month}`,
            marryChildren: true,
            children: [
                withCenterAlign({
                    field: `plan_${key}`,
                    colId: `plan_${key}`,
                    headerName: __("План"),
                    ...fixedWidth(PERIOD_COL_WIDTH),
                    sortable: false,
                    suppressMovable: true,
                    tree: false,
                    type: "number",
                    hide: hidePlan,
                    valueFormatter: formatNumber,
                    cellClassRules: {
                        ...planPeriodClassRules(frm, period),
                        ...missingPlanCellClassRules(frm, period),
                    },
                }),
                withCenterAlign({
                    field: `actual_${key}`,
                    colId: `actual_${key}`,
                    headerName: actualLabel,
                    ...fixedWidth(PERIOD_COL_WIDTH),
                    sortable: false,
                    suppressMovable: true,
                    tree: false,
                    type: "number",
                    edit: (row) => !period.is_past && row?.merge_group_id !== SUMMARY_ROW_ID,
                    valueFormatter: formatNumber,
                    cellClassRules: {
                        ...actualPeriodClassRules(frm, period),
                        ...actualCellClassRules(frm, period),
                    },
                }),
                withCenterAlign({
                    field: `delta_${key}`,
                    colId: `delta_${key}`,
                    headerName: "Δ",
                    ...fixedWidth(PERIOD_COL_WIDTH),
                    sortable: false,
                    suppressMovable: true,
                    tree: false,
                    type: "number",
                    hide: hideDelta,
                    valueFormatter: formatDelta,
                    cellClassRules: deltaPeriodClassRules(frm, period),
                }),
            ],
        };
    });
}

export function getColumns(frm, periods) {
    const spanRows = DinextTable.createMergeGroupSpanRows({ mergeGroup: MERGE_GROUP });
    const form = frm || (typeof cur_frm !== "undefined" ? cur_frm : null);
    const periodList = periods || form?.we_v2?.periods || [];

    const baseColumns = [
        {
            field: "_selected",
            colId: "_selected",
            headerName: "",
            ...fixedWidth(36),
            sortable: false,
            suppressMovable: true,
            pinned: "left",
            tree: false,
            type: "checkbox",
            edit: true,
            spanRows,
            // checkbox type already centers via dinext editors
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
            flex: 1,
            minWidth: 250,
            pinned: "left",
            tree: true,
            spanRows,
            cellClassRules: missingPlanTaskClassRules(form || {}),
        },
        {
            field: "role",
            headerName: __("Роль"),
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

    return [...baseColumns, ...buildPeriodColumns(form || {}, periodList)];
}

export function refreshColumns(frm) {
    const state = frm.we_v2;
    if (!state?.table?.setOption) {
        return;
    }
    state.table.setOption("columns", getColumns(frm, state.periods));
}

/** Toggle plan/Δ без полной пересборки columnDefs (фаза 9). */
export function applyPlanDeltaVisibility(frm) {
    const state = frm.we_v2;
    const api = state?.table?.api;
    const periods = state?.periods || [];
    if (!api || !periods.length) {
        refreshColumns(frm);
        return;
    }

    const planIds = periods.map((period) => `plan_${period.key}`);
    const deltaIds = periods.map((period) => `delta_${period.key}`);
    const showPlan = !frm.hide_plan;
    const showDelta = !frm.hide_delta;

    if (typeof api.setColumnsVisible === "function") {
        api.setColumnsVisible(planIds, showPlan);
        api.setColumnsVisible(deltaIds, showDelta);
    } else {
        refreshColumns(frm);
        return;
    }

    for (const col of state.table.columns || []) {
        for (const child of col.children || []) {
            if (planIds.includes(child.colId || child.field)) {
                child.hide = !showPlan;
            } else if (deltaIds.includes(child.colId || child.field)) {
                child.hide = !showDelta;
            }
        }
    }
}
