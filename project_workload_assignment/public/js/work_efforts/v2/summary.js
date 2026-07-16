/**
 * Summary rows from GRID_V2 API only.
 */
export function buildSummaryRows(frm, periods, apiSummaryRows) {
    if (apiSummaryRows?.length) {
        return apiSummaryRows;
    }
    return [];
}

export function syncExpandedIds(frm) {
    const table = frm.we_v2?.table;
    if (!table?.expandedIds) return;
    frm._we_v2_expanded_ids = [...table.expandedIds];
    if (frm.we_v2) {
        frm.we_v2.expandedIds = frm._we_v2_expanded_ids;
    }
}

export function attachTreePersistence(frm, table) {
    if (!table || table._treePersistence) return;

    const wrap = (methodName, isAsync = false) => {
        const original = table[methodName]?.bind(table);
        if (!original) return;
        if (isAsync) {
            table[methodName] = async (...args) => {
                const result = await original(...args);
                syncExpandedIds(frm);
                return result;
            };
            return;
        }
        table[methodName] = (...args) => {
            const result = original(...args);
            syncExpandedIds(frm);
            return result;
        };
    };

    wrap("toggleRow");
    wrap("expandRow", true);
    wrap("collapseRow");
    table._treePersistence = true;
}

export function getExpandedIds(frm) {
    return frm._we_v2_expanded_ids || frm.we_v2?.expandedIds || [];
}
