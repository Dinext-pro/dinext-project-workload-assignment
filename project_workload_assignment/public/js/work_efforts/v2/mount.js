import { initState } from "./state.js";
import { reloadTable } from "./data.js";
import { initTable, refreshRuntime } from "./table.js";

const TABLE_CLASS = "work-efforts-table";

/**
 * Host element for DinextTable (former StickyDataTable slot).
 * @param {JQuery} wrapper
 * @returns {HTMLElement|null}
 */
export function resolveTableContainer(wrapper) {
    let table = wrapper.find(`.${TABLE_CLASS}`);
    if (!table.length) {
        const legend = wrapper.find(".work-efforts-legend");
        table = $(`<div class="${TABLE_CLASS}"></div>`);
        if (legend.length) {
            table.insertBefore(legend);
        } else {
            wrapper.append(table);
        }
    }

    const containerEl = table[0];
    containerEl.style.height = "min(50vh, 560px)";
    containerEl.style.minHeight = "280px";
    return containerEl;
}

/** Mount DinextTable into `.work-efforts-table`. */
export async function ensureMounted(frm) {
    project_workload_assignment.work_efforts?.applyWorkEffortsStyles?.();

    const field = frm.get_field("custom_work_efforts");
    if (!field?.$wrapper?.length) {
        return;
    }

    const container = resolveTableContainer(field.$wrapper);
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
