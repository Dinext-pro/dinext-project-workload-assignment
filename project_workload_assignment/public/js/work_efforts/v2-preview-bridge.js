// TEMPORARY bridge: legacy render.js ↔ WorkEffortsV2 bundle. Cutover: delete file.
frappe.provide("project_workload_assignment.workEffortsPreview");

function previewBundlePath() {
    return frappe.assets.bundled_asset("we-v2.bundle.js");
}

function whenReady(frm, callback) {
    const run = () => {
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
