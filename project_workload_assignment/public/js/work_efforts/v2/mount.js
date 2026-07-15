import { isPreviewEnabled, resolvePreviewContainer } from "./dual-preview-mount.js";
import { initState } from "./state.js";
import { reloadTable } from "./data.js";
import { initTable, refreshRuntime } from "./table.js";

export async function ensureMounted(frm) {
    if (!isPreviewEnabled(frm)) {
        return;
    }

    project_workload_assignment.work_efforts?.applyWorkEffortsStyles?.();

    const field = frm.get_field("custom_work_efforts");
    if (!field?.$wrapper?.length) {
        return;
    }

    const container = resolvePreviewContainer(frm, field.$wrapper);
    if (!container) {
        return;
    }

    const state = initState(frm);
    state.container = container;

    if (state._mountPromise) {
        return state._mountPromise;
    }

    state._mountPromise = (async () => {
        try {
            if (state.table) {
                await reloadTable(frm, initTable, refreshRuntime);
                return;
            }
            await initTable(frm);
        } finally {
            state._mountPromise = null;
        }
    })();

    return state._mountPromise;
}
