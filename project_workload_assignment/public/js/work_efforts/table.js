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

const FS_SHELL_CLASS = "work_efforts_container--fullscreen";

/** Fullscreen shell = .work_efforts_container (controls + table; legend hidden via CSS). */
function resolveFullscreenOpts(container) {
    const shell = container?.closest?.(".work_efforts_container");
    if (!shell) {
        return null;
    }

    const afterLayout = () => {
        requestAnimationFrame(() => {
            window.dispatchEvent(new Event("resize"));
        });
    };

    return {
        target: "shell",
        shell,
        onEnter: ({ element }) => {
            element?.classList.add(FS_SHELL_CLASS);
            if (container) {
                container.dataset.wePrevHeight = container.style.height || "";
                container.dataset.wePrevMinHeight = container.style.minHeight || "";
                container.style.height = "auto";
                container.style.minHeight = "0";
                container.style.flex = "1 1 auto";
            }
            afterLayout();
        },
        onExit: ({ element }) => {
            element?.classList.remove(FS_SHELL_CLASS);
            if (container) {
                container.style.height = container.dataset.wePrevHeight || "min(50vh, 560px)";
                container.style.minHeight = container.dataset.wePrevMinHeight || "280px";
                container.style.flex = "";
                delete container.dataset.wePrevHeight;
                delete container.dataset.wePrevMinHeight;
            }
            afterLayout();
        },
    };
}

function buildTableOptions(frm, state) {
    const summaryRows = buildSummaryRows(frm, state.periods, state.summaryRows);

    const opts = {
        container: state.container,
        data: state.rows,
        columns: getColumns(frm, state.periods),
        summaryRows,
        summary: { pin: "bottom", edit: false, clipboard: false, selection: false },
        expandedIds: getExpandedIds(frm),
        edit: false,
        selection: { enabled: true },
        fillHandle: { enabled: true },
        // Gutter DnD default-on in DinextTable; WE merge-groups are not reorder targets.
        rowReorder: { enabled: false },
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
        gridOptions: {
            enableCellSpan: true,
            // Density close to legacy role line (24px) + AG Grid chrome
            rowHeight: 28,
            headerHeight: 32,
            groupHeaderHeight: 28,
        },
    };

    const fullscreen = resolveFullscreenOpts(state.container);
    if (fullscreen) {
        opts.fullscreen = fullscreen;
    }
    return opts;
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
            if (typeof render_labour_percentage_chart === "function") {
                render_labour_percentage_chart(frm);
            }
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
    if (typeof render_labour_percentage_chart === "function") {
        render_labour_percentage_chart(frm);
    }
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
