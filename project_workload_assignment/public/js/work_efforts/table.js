import { MERGE_GROUP } from "./constants.js";
import { initState } from "./state.js";
import { loadGridData, reloadTable } from "./data.js";
import { applyPlanDeltaVisibility, getColumns, refreshColumns } from "./columns.js";
import {
    attachTreePersistence,
    buildSummaryRows,
    getExpandedIds,
    syncExpandedIds,
} from "./summary.js";
import { onSaveCells, onValidateCells } from "./save.js";
import { ensurePeriodLimits } from "./limits.js";
import { ensureWorkloadPeriods } from "./period-markers.js";
import { onAssignmentsToggle } from "./assignments.js";
import { onCellDoubleClicked, syncPlFromWe } from "./navigation.js";
import { buildToolbarItems } from "./toolbar.js";
import {
    missingPlanRoleTooltipValue,
    missingPlanTaskTooltipValue,
} from "./plan_check.js";

function bindMissingPlanTooltips(frm, gridOptions) {
    const prevOver = gridOptions.onCellMouseOver;
    const prevOut = gridOptions.onCellMouseOut;
    gridOptions.enableBrowserTooltips = false;
    gridOptions.onCellMouseOver = (params) => {
        if (typeof prevOver === "function") prevOver(params);
        const we = project_workload_assignment.work_efforts;
        const colId = params?.column?.getColId?.() || params?.colDef?.field || "";
        let text;
        if (colId === "task_subject" || colId === "task_serial") {
            text = missingPlanTaskTooltipValue(frm)({ data: params?.data });
        } else if (colId === "role") {
            text = missingPlanRoleTooltipValue(frm)({ data: params?.data });
        }
        if (!text) return;
        params?.api?.hideTooltip?.();
        const el =
            params?.event?.target?.closest?.(".ag-cell") || params?.event?.target;
        if (el && we?.showCustomTooltip) {
            // Colored legacy tip only; colDef must not set tooltipValueGetter (AG white popup).
            el.removeAttribute("title");
            we.showCustomTooltip(el, text);
        }
    };
    gridOptions.onCellMouseOut = (params) => {
        if (typeof prevOut === "function") prevOut(params);
        project_workload_assignment.work_efforts?.hideCustomTooltip?.();
    };
}

function bindFullscreenOverlayPortal(options) {
    const prevEnter = options.onFullscreenEnter;
    const prevExit = options.onFullscreenExit;
    options.onFullscreenEnter = (ctx) => {
        if (typeof prevEnter === "function") prevEnter(ctx);
        project_workload_assignment.work_efforts?.start_fullscreen_overlay_watch?.();
        project_workload_assignment.work_efforts?.bring_overlays_into_fullscreen?.();
    };
    options.onFullscreenExit = (ctx) => {
        if (typeof prevExit === "function") prevExit(ctx);
        project_workload_assignment.work_efforts?.stop_fullscreen_overlay_watch?.();
    };
}

function buildTableOptions(frm, state) {
    const gridOptions = {
        enableCellSpan: true,
        suppressMovableColumns: true,   // WE column order fixed (Task/Role/periods); no header drag-reorder.
        rowHeight: 28,                  // Density close to legacy role line (24px) + AG Grid chrome
        headerHeight: 32,
        groupHeaderHeight: 28,
    };
    bindMissingPlanTooltips(frm, gridOptions);

    const options = {
        container: state.container,
        data: state.rows,
        columns: getColumns(frm, state.periods),
        summaryRows: buildSummaryRows(frm, state.periods, state.summaryRows),
        summary: { pin: "bottom", edit: false, clipboard: false, selection: false },
        expandedIds: getExpandedIds(frm),
        edit: false,
        selection: { enabled: true },
        fillHandle: { enabled: true },
        // Checkbox select for «Сохранить план»; mergeHead = one check per task group.
        rowCheck: { enabled: true, unit: "mergeHead", selectAll: true },
        // Gutter DnD default-on in DinextTable; WE merge-groups are not reorder targets.
        rowReorder: { enabled: false },
        filter: {
            // Role search keeps matching roles, not the whole task merge block.
            mergeMatchMode: "rows",
            // A parent kept only as a path to a matching child needs one context row.
            mergeAncestorMode: "head",
            // Role tails inherit the visually merged task value while filtering.
            mergeInheritedFields: ["task_subject"],
        },
        toolbar: {
            persistKey: `work-efforts:${frm.doc?.name || "new"}`,
            items: buildToolbarItems(frm),
        },
        // Dense cells via Quartz theme API (not .ag-cell padding hacks)
        theme: {
            cellHorizontalPadding: 6,
            columnBorder: true,
            headerColumnBorder: true,
        },
        onValidateCells: (ctx) => onValidateCells(frm, ctx),
        onSaveCells: (ctx) => onSaveCells(frm, ctx),
        onCellDoubleClicked: (params) => onCellDoubleClicked(frm, params),
        mergeGroup: MERGE_GROUP,
        gridOptions,
    };
    bindFullscreenOverlayPortal(options);
    return options;
}

function applyRuntime(frm, table) {
    attachTreePersistence(frm, table);
}

export async function initTable(frm) {
    const state = initState(frm);

    if (!state.container) return null;
    if (state.table) return state.table;
    if (state._initPromise) return state._initPromise;

    state._initPromise = (async () => {
        try {
            await frappe.require(["dinext-table.bundle.js"]);
            await loadGridData(frm);
            await Promise.all([ensurePeriodLimits(frm), ensureWorkloadPeriods(frm)]);

            if (state.table) {
                return state.table;
            }

            const table = await DinextTable.create(buildTableOptions(frm, state));
            state.table = table;
            applyRuntime(frm, table);
            syncPlFromWe(frm);
            project_workload_assignment.work_efforts.render_work_efforts_chart?.(frm);
            project_workload_assignment.work_efforts.load_work_efforts_progress?.(frm);
            return table;
        } finally {
            state._initPromise = null;
        }
    })();

    return state._initPromise;
}

function afterWeDataReady(frm) {
    syncPlFromWe(frm);
    project_workload_assignment.work_efforts.render_work_efforts_chart?.(frm, false);
    project_workload_assignment.work_efforts.load_work_efforts_progress?.(frm);
}

export async function refreshRuntime(frm) {
    const state = frm.we;
    if (!state?.table) return;

    syncExpandedIds(frm);
    await Promise.all([ensurePeriodLimits(frm), ensureWorkloadPeriods(frm)]);

    const summaryRows = buildSummaryRows(frm, state.periods, state.summaryRows);
    state.summaryRows = summaryRows;

    if (state.table.setOption) {
        state.table.setOption("columns", getColumns(frm, state.periods));
    }
    if (state.table.setSummaryRows) {
        state.table.setSummaryRows(summaryRows);
    }
    if (state.table.refresh) {
        state.table.refresh(state.rows);
    }
    afterWeDataReady(frm);
}

export function refreshSummary(frm) {
    const state = frm.we;
    if (!state?.table) return;
    const summaryRows = buildSummaryRows(frm, state.periods, state.summaryRows);
    state.summaryRows = summaryRows;
    state.table.setSummaryRows?.(summaryRows);
}

/** Toggle «План» / «Δ»: visibility + summary (без reload данных). */
export function onTogglePlanOrDelta(frm) {
    applyPlanDeltaVisibility(frm);
    refreshSummary(frm);
}

/**
 * Смена view options: periods/actual зависят от view_mode → reload + columns.
 * Ожидает, что caller уже сбросил `frm.we_periods` и выставил `frm.view_options`.
 */
export async function onViewOptionsChange(frm) {
    return reloadTable(frm, initTable, refreshRuntime);
}

export { applyPlanDeltaVisibility, onAssignmentsToggle, refreshColumns };
