export function initState(frm) {
    if (!frm.we) {
        frm.we = {
            table: null,
            rows: [],
            periods: [],
            summaryRows: [],
            expandedIds: [],
            container: null,
        };
    }
    return frm.we;
}

export function destroyTable(frm) {
    const state = frm.we;
    if (state?.table?.destroy) {
        state.table.destroy();
    }
    if (state) {
        state.table = null;
        state.container = null;
        state._mountPromise = null;
        state._initPromise = null;
    }
}
