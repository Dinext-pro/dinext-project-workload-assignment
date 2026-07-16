// Оптимизированный модуль для подсчёта сумм трудозатрат
// https://erp.dinord.ru/app/issue/ISS-2025-02915
// ISS-2025-01239: первый модуль shell (work_efforts/entry.js → work-efforts.bundle).
// Публичный API — project_workload_assignment.work_efforts.* (Object.assign в конце каждого файла).

frappe.provide("project_workload_assignment.work_efforts");

// Предположение: идентификатор задачи — task.value (как в вашем коде)
// aggregatedTasksIn — объект { key: taskObj } или массив taskObj
const _taskIndexCache = new WeakMap();

/**
 * Очистить кеш агрегатора для конкретного aggregatedTasksIn.
 * @param {Record<string, ConsolidatedTaskEntry> | ConsolidatedTaskEntry[] | null | undefined} aggregatedTasksIn
 */
function clearTaskIndexCacheFor(aggregatedTasksIn) {
    if (aggregatedTasksIn && _taskIndexCache.has(aggregatedTasksIn)) {
        _taskIndexCache.delete(aggregatedTasksIn);
    }
}

/**
 * @param {Record<string, ConsolidatedTaskEntry> | ConsolidatedTaskEntry[] | null | undefined} aggregatedTasksIn
 * @returns {object | null}
 */
function makeAggregator(aggregatedTasksIn) {
    if (!aggregatedTasksIn) return null;
    let agr = _taskIndexCache.get( aggregatedTasksIn );
    if (agr) return agr;
    
    // Преобразуем в массив и построим быстрые структуры
    const tasksArr = Array.isArray(aggregatedTasksIn) ? aggregatedTasksIn : Object.values(aggregatedTasksIn || {});
    const tasksById = new Map();               // id -> taskObj
    const childrenMap = new Map();             // parentId -> [ childId, ... ]
    const roleValueMap = new Map();            // taskId -> Map(role -> { key: numericValue, ... })
    const rootIds = [];

    for (let t of tasksArr) {
        const id = t.value;
        tasksById.set(id, t);

        if (t.parent_task) {
            const arr = childrenMap.get(t.parent_task);
            if (arr) arr.push(id); else childrenMap.set(t.parent_task, [id]);
        } else {
            rootIds.push(id);
        }

        // Map role -> numeric values for keys like plan_YYYY_M or fact_YYYY_M etc.
        const rmap = new Map();
        if (Array.isArray(t.role_data)) {
            for (const r of t.role_data) {
                if (!r || typeof r.role !== 'string') continue;
                const m = new Map();
                for (const k in r) {
                    // Pre-parse numeric fields we care about
                    if (k.startsWith('plan_') || k.startsWith('fact_') || k.startsWith('forecast_')) {
                        const v = parseFloat(r[k]);
                        m.set(k, isNaN(v) ? 0 : v);
                    }
                }
                rmap.set(r.role, m);
            }
        }
        roleValueMap.set(id, rmap);
    }

    // Global memo map: memoKey -> numeric sum
    // memoKey format: `${taskId}|${role}|${valueKey}_${year}_${month}`
    const memo = new Map();

    function makeRoleKey(valueKey, year, month) {
        return `${valueKey}_${year}_${month}`;
    }

    // Итеративный пост-ордeр обход для вычисления суммы потомков для конкретной задачи/роли/valueKey
    function computeSumIterative(taskId, role, valueKey, year, month) {
        const roleKey = makeRoleKey(valueKey, year, month);
        const memoKey = `${taskId}|${role}|${roleKey}`;
        if (memo.has(memoKey)) return memo.get(memoKey);

        // Stack for manual DFS: { id, state }
        // state 0 = enter, 1 = exit/process
        const stack = [{ id: taskId, state: 0 }];
        while (stack.length) {
            const node = stack.pop();
            const id = node.id;
            const key = `${id}|${role}|${roleKey}`;

            if (node.state === 0) {
                if (memo.has(key)) continue; // уже посчитано
                // push exit marker
                stack.push({ id, state: 1 });
                // push children (enter) if any and not already in memo
                const childs = childrenMap.get(id);
                if (childs && childs.length) {
                    for (let i = 0; i < childs.length; i++) {
                        const cid = childs[i];
                        const childKey = `${cid}|${role}|${roleKey}`;
                        if (!memo.has(childKey)) {
                            stack.push({ id: cid, state: 0 });
                        }
                    }
                }
            } else {
                // state === 1, обработать: собрать сумму по прямым детям (или взять их мемоизированные суммы)
                let sum = 0;
                const childs = childrenMap.get(id);
                if (childs && childs.length) {
                    for (let i = 0; i < childs.length; i++) {
                        const cid = childs[i];
                        const roleMap = roleValueMap.get(cid);
                        const val = roleMap && roleMap.get(role) ? (roleMap.get(role).get(roleKey) || 0) : 0;
                        if (val > 0) {
                            sum += val;
                        } else {
                            // берем уже вычисленное значение для ребёнка (должно быть из memo, т.к. мы обработали детей раньше)
                            const childMemoKey = `${cid}|${role}|${roleKey}`;
                            const childSum = memo.has(childMemoKey) ? memo.get(childMemoKey) : 0;
                            sum += childSum;
                        }
                    }
                }
                memo.set(key, sum);
            }
        }
        return memo.get(memoKey);
    }

    let aggr = {
        childrenMap,
        roleValueMap,
        tasksById,
        rootIds,
        memo,
        computeSumIterative,
        clearCache() { memo.clear(); }
    };
    _taskIndexCache.set( aggregatedTasksIn, aggr );
    return aggr;
}

/**
 * Сумма plan/actual по колонке периода (оптимизированный агрегатор).
 * @param {WorkEffortsForm} frm
 * @param {string[]} roles
 * @param {DisplayPeriod} period
 * @param {boolean} [calc_plan]
 * @param {boolean} [calc_fact]
 * @returns {ColumnTotal}
 */
function calc_we_column_total_optimized(frm, roles, period, calc_plan = true, calc_fact = false) {
    // Построим агрегатор (рекомендуется вызывать подготовку один раз и переиспользовать объект)
    let aggregator = project_workload_assignment.work_efforts.makeAggregator(frm.aggregatedTasks);

    const year = period.year;
    const month = period.month;
    const isPast = !!period.is_past;

    let totalPlan = 0;
    let totalActual = 0;

    const rootIds = aggregator.rootIds;
    const roleValueMap = aggregator.roleValueMap;
    const computeSum = aggregator.computeSumIterative;

    // iterate roles
    for (let r = 0; r < roles.length; r++) {
        const role = roles[r];
        let rolePlan = 0;
        let roleActual = 0;

        // iterate roots
        for (let i = 0; i < rootIds.length; i++) {
            const rootId = rootIds[i];
            const roleMap = roleValueMap.get(rootId);
            const planKey = `plan_${year}_${month}`;
            const actualKey = `${(isPast || calc_fact) ? 'fact' : 'forecast'}_${year}_${month}`;

            let plan_sum = (roleMap && roleMap.get(role)) ? (roleMap.get(role).get(planKey) || 0) : 0;
            let actual_sum = (roleMap && roleMap.get(role)) ? (roleMap.get(role).get(actualKey) || 0) : 0;

            if (!plan_sum && calc_plan) {
                plan_sum = computeSum(rootId, role, 'plan', year, month);
            }
            if (!actual_sum) {
                actual_sum = computeSum(rootId, role, (isPast || calc_fact) ? 'fact' : 'forecast', year, month);
            }

            rolePlan += plan_sum;
            roleActual += actual_sum;
        }

        totalPlan += rolePlan;
        totalActual += roleActual;
    }

    return { plan: totalPlan, actual: totalActual };
}

Object.assign(project_workload_assignment.work_efforts, {
    clearTaskIndexCacheFor,
    makeAggregator,
    calc_we_column_total_optimized,
});
