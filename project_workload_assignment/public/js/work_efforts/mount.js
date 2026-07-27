import { initState } from "./state.js";
import { reloadTable } from "./data.js";
import { initTable, refreshRuntime } from "./table.js";

const TABLE_CLASS = "work-efforts-table";
const FIELD = "custom_work_efforts";

/**
 * Host element for DinextTable (former StickyDataTable slot).
 * @param {JQuery} wrapper
 * @returns {HTMLElement|null}
 */
export function resolveTableContainer(wrapper) {
	let table = wrapper.find(`.${TABLE_CLASS}`);
	if (!table.length) {
		table = $(`<div class="${TABLE_CLASS}"></div>`).appendTo(wrapper);
	}

	const containerEl = table[0];
	containerEl.style.height = "min(50vh, 560px)";
	containerEl.style.minHeight = "280px";
	return containerEl;
}

/** Mount DinextTable into `.work-efforts-table`. Caller must ensure tab is visible. */
export async function ensureMounted(frm) {
	const field = frm.get_field(FIELD);
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
			} else {
				await initTable(frm);
			}
		} finally {
			state._mountPromise = null;
		}
	})();

	return state._mountPromise;
}
