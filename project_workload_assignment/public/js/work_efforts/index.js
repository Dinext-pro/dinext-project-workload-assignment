import { installLazyTabMountApi } from "../core/lazy-tab-mount.js";
import { destroyTable } from "./state.js";
import { buildSummaryRows } from "./summary.js";
import { ensureMounted } from "./mount.js";
import { reloadTable } from "./data.js";
import {
    applyPlanDeltaVisibility,
    initTable,
    onTogglePlanOrDelta,
    onViewOptionsChange,
    refreshColumns,
    refreshRuntime,
    refreshSummary,
} from "./table.js";
import {
    buildSavePlanPayload,
    getSelectedTaskIds,
    saveForecastAsPlan,
} from "./selection.js";
import { refreshLimitHighlight } from "./limits.js";
import { addRole, deleteRole } from "./roles.js";
import { onAssignmentsToggle, refreshAssignmentsCells } from "./assignments.js";
import { runMissingPlanCheck, refreshCheckHighlight } from "./plan_check.js";

let ready = false;

const WorkEfforts = {
    isReady() {
        return ready;
    },

    ensureMounted,

    destroy(frm) {
        destroyTable(frm);
    },

    async refresh(frm) {
        return reloadTable(frm, initTable, refreshRuntime);
    },

    refreshColumns,
    applyPlanDeltaVisibility,
    onTogglePlanOrDelta,
    onViewOptionsChange,
    onAssignmentsToggle,
    refreshAssignmentsCells,
    refreshSummary,
    buildSummaryRows,
    getSelectedTaskIds,
    buildSavePlanPayload,
    saveForecastAsPlan,
    refreshLimitHighlight,
    addRole,
    deleteRole,
    runMissingPlanCheck,
    refreshCheckHighlight,
};

ready = true;
window.WorkEfforts = WorkEfforts;
// Temporary alias after rename from WorkEffortsV2.
window.WorkEffortsV2 = WorkEfforts;
installLazyTabMountApi();

export { WorkEfforts };
