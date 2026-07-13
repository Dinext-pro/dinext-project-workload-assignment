// TEMPORARY bridge: legacy render.js ↔ WorkEffortsV2 bundle. Cutover: delete file.
frappe.provide("project_workload_assignment.workEffortsPreview");

const PREVIEW_CSS = "/assets/project_workload_assignment/css/we-v2.css";
const DINEXT_TABLE_CSS = "/assets/dinext_common/css/dinext-table.css";
/** Bump when we-v2.css layout rules change — bustes sticky browser/proxy cache. */
const PREVIEW_CSS_VER = "20260713-borders2";

const SPAN_ROW_PIN_CSS = `
.work-efforts-table-v2.dinext-table {
	--we-v2-row-height: 28px;
}
/* Merge span: pin task/#/checkbox to FIRST role row (legacy WE), not vertical center. */
.work-efforts-table-v2 .ag-spanned-cell-wrapper > .ag-spanned-cell {
	display: flex !important;
	align-items: flex-start !important;
	height: 100%;
	box-sizing: border-box;
}
.work-efforts-table-v2 .ag-spanned-cell-wrapper > .ag-spanned-cell > .ag-cell-wrapper,
.work-efforts-table-v2 .ag-spanned-cell-wrapper > .ag-spanned-cell > .dinext-table-tree-cell,
.work-efforts-table-v2 .ag-spanned-cell-wrapper > .ag-spanned-cell > .dinext-table-tree-cell--merge-group {
	height: var(--we-v2-row-height, 28px) !important;
	min-height: var(--we-v2-row-height, 28px) !important;
	max-height: var(--we-v2-row-height, 28px) !important;
	box-sizing: border-box;
}
.work-efforts-table-v2 .ag-spanned-cell-wrapper > .ag-spanned-cell > .ag-cell-wrapper {
	display: flex !important;
	align-items: center !important;
	width: 100%;
}
.work-efforts-table-v2 .ag-cell[col-id="_selected"] .ag-spanned-cell-wrapper > .ag-spanned-cell > .ag-cell-wrapper {
	justify-content: center !important;
}
.work-efforts-table-v2 .ag-spanned-cell-wrapper > .ag-spanned-cell[col-id="task_serial"] {
	line-height: var(--we-v2-row-height, 28px) !important;
}
`;

function previewBundlePath() {
    return frappe.assets.bundled_asset("we-v2.bundle.js");
}

function ensureStylesheet(href) {
    if (document.querySelector(`link[data-we-v2-href="${href}"], link[href^="${href}"]`)) {
        return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href.includes("?") ? href : `${href}?v=${PREVIEW_CSS_VER}`;
    link.setAttribute("data-we-v2-href", href.split("?")[0]);
    document.head.appendChild(link);
}

function ensureSpanRowPinStyles() {
    let el = document.getElementById("we-v2-span-row-pin");
    if (!el) {
        el = document.createElement("style");
        el.id = "we-v2-span-row-pin";
        document.head.appendChild(el);
    }
    el.textContent = SPAN_ROW_PIN_CSS;
}

function ensurePreviewStyles() {
    ensureStylesheet(PREVIEW_CSS);
    ensureStylesheet(DINEXT_TABLE_CSS);
    ensureSpanRowPinStyles();
}

function whenReady(frm, callback) {
    ensurePreviewStyles();

    const run = () => {
        ensureSpanRowPinStyles();
        window.WorkEffortsV2.ensureMounted(frm);
        callback?.();
    };

    if (window.WorkEffortsV2?.isReady?.()) {
        run();
        return;
    }

    frappe.require([previewBundlePath()], () => {
        if (!window.WorkEffortsV2?.isReady?.()) {
            console.error("[WorkEfforts] we-v2.bundle.js did not register WorkEffortsV2");
            return;
        }
        run();
    });
}

function onTogglePlanOrDelta(frm) {
    whenReady(frm, () => {
        window.WorkEffortsV2.onTogglePlanOrDelta(frm);
    });
}

function onViewOptionsChange(frm) {
    whenReady(frm, () => {
        window.WorkEffortsV2.onViewOptionsChange(frm);
    });
}

function saveForecastAsPlan(frm) {
    whenReady(frm, () => {
        window.WorkEffortsV2.saveForecastAsPlan(frm);
    });
}

function onAssignmentsToggle(frm) {
    whenReady(frm, () => {
        window.WorkEffortsV2.onAssignmentsToggle(frm);
    });
}

function runMissingPlanCheck(frm) {
    whenReady(frm, () => {
        window.WorkEffortsV2.runMissingPlanCheck(frm);
    });
}

Object.assign(project_workload_assignment.workEffortsPreview, {
    whenReady,
    onTogglePlanOrDelta,
    onViewOptionsChange,
    onAssignmentsToggle,
    saveForecastAsPlan,
    runMissingPlanCheck,
    destroy(frm) {
        window.WorkEffortsV2?.destroy(frm);
    },
});
