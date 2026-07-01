// === Frappe Script Metadata ===
// Managed By: pull_iss_2026_00865_scripts_demodev.py
// Kind: Client Script
// Script Name: Projects Workload Report_V4
// Reference DocType: Projects Workload Report
// View: Form
// Enabled: 1
// Fixture Modified: 2026-06-15 10:10:11.850820
// Module: Project Workload Assignment
// Content SHA256: 68e77f7ae1e40d58c0e9e2b7fca63c5ffe29fbb0d1cee4494c3d8986c7eec8de
// === /Frappe Script Metadata ===

// Основной скрипт - ОПТИМИЗИРОВАННАЯ ВЕРСИЯ БЕЗ CSS В JS
function pwrShared() {
    return project_workload_assignment.pwrShared || {};
}

function ensureProjectsWorkloadAgGrid() {
    if (pwrShared().ensureAgGrid) {
        return pwrShared().ensureAgGrid();
    }
    return Promise.reject(new Error('pwrShared.ensureAgGrid is not available'));
}

let isProjectsWorkloadLoading = false;
let projectsWorkloadLoadTimeout = null;

// Кэш для данных
let projectsWorkloadCache = {
    userData: {},
    taskCache: {},
    projectCache: {},
    assignmentCache: {},
    userAbsenceCache: {},
    workerCache: {},
    timesheetTemplateCache: {},
    workingHoursOverrideCache: {},
    userWorkingHoursCache: {},
    holidayCache: {},
    globalCache: {}
};

// Глобальные переменные
let projectsWorkloadTableData = [];
let isProjectsWorkloadRedrawing = false;
let currentViewType = 'weekly'; // ISS-2026-00865 V4: первично открываем квартал по неделям
let currentPeriodRange = 'quarter'; // По умолчанию квартал
window.currentViewType = currentViewType;
window.pwrViewType = currentViewType;
window.currentPeriodRange = currentPeriodRange;
window.pwrPeriodAnchorDate = window.pwrPeriodAnchorDate || frappe.datetime.get_today();
window.pwrShowFact = !!window.pwrShowFact;
window.pwrWorkerWtype = window.pwrWorkerWtype || '';
let pendingPwrReloadOptions = null;

if (!window._pwrViewTypePageShowBound) {
    window._pwrViewTypePageShowBound = true;
    window.addEventListener('pageshow', function (event) {
        if (!event.persisted) {
            return;
        }
        window.pwrViewType = currentViewType;
        window.currentViewType = currentViewType;
    });
}

function isPwrShowFactEnabled() {
    return pwrShared().isPwrShowFactEnabled ? pwrShared().isPwrShowFactEnabled(window.cur_frm) : !!window.pwrShowFact;
}

function getPwrLoadActualFlag(options) {
    return pwrShared().getPwrLoadActualFlag
        ? pwrShared().getPwrLoadActualFlag(options)
        : (isPwrShowFactEnabled() ? 1 : 0);
}

function withPwrLoadActualOptions(options = {}) {
    if (options.loadActual != null) {
        return options;
    }
    return { ...options, loadActual: getPwrLoadActualFlag() };
}

function renderPwrPlanFactCell(options) {
    return pwrShared().renderPwrPlanFactCell
        ? pwrShared().renderPwrPlanFactCell(options)
        : null;
}

function resetPwrPeriodAnchorForFilters() {
    window.pwrPeriodAnchorDate = frappe.datetime.get_today();
    if (
        project_workload_assignment.charts &&
        typeof project_workload_assignment.charts.resetTeamPeriodAnchorToToday === "function"
    ) {
        project_workload_assignment.charts.resetTeamPeriodAnchorToToday();
    }
}

function getPwrPeriodAnchorLabel(frm) {
    return pwrShared().getPwrPeriodAnchorLabel
        ? pwrShared().getPwrPeriodAnchorLabel(frm || cur_frm)
        : frappe.datetime.str_to_user(window.pwrPeriodAnchorDate || frappe.datetime.get_today());
}

function triggerPwrWorkloadDataReload(frm) {
    if (pwrShared().triggerPwrWorkloadDataReload) {
        pwrShared().triggerPwrWorkloadDataReload(frm || cur_frm, {
            showFact: isPwrShowFactEnabled(),
            periodAnchor: window.pwrPeriodAnchorDate,
        });
    }
}

function createPwrPeriodNavFilter(container, frm) {
    return pwrShared().createPwrPeriodNavFilter
        ? pwrShared().createPwrPeriodNavFilter(container, frm)
        : $();
}

function reloadProjectsWorkloadTableForWorkerFilter(frm) {
    const reloadFn = window.debouncedLoadProjectsWorkloadData || debouncedLoadProjectsWorkloadData;
    if (typeof reloadFn !== 'function') {
        console.error('[PWR] debouncedLoadProjectsWorkloadData is not available');
        return;
    }
    reloadFn(frm, true, {
        workerWtype: window.pwrWorkerWtype || '',
        loadActual: getPwrLoadActualFlag(),
    });
}

function createPwrWorkerTypeFilter(container) {
    return pwrShared().createPwrWorkerTypeFilter
        ? pwrShared().createPwrWorkerTypeFilter(container)
        : $();
}

function createPwrShowFactFilter(container) {
    return pwrShared().createPwrShowFactFilter
        ? pwrShared().createPwrShowFactFilter(container)
        : $();
}
let currentProjectsWorkloadPeriods = [];
let projectsWorkloadPaging = {
    limit: 20,
    offset: 0,
    nextOffset: 0,
    hasMore: false,
    totalUsers: 0,
    isLoadingMore: false
};
let loadedProjectDetailsByUser = {};

// Статистика кэширования
let cacheHits = 0;
let cacheMisses = 0;

// Система измерения производительности
const performanceLog = {};

// ISS-2026-00625: Проверка роли Project Manager
function hasProjectManagerRole() {
    return frappe.user.has_role('Dinext_User');
}

function startTimer(name) {
    const uniqueName = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    performanceLog[uniqueName] = {
        start: performance.now(),
        end: null,
        duration: null,
        originalName: name
    };
    return uniqueName; // Возвращаем уникальное имя
}

function endTimer(uniqueName) {
    if (performanceLog[uniqueName]) {
        performanceLog[uniqueName].end = performance.now();
        performanceLog[uniqueName].duration = performanceLog[uniqueName].end - performanceLog[uniqueName].start;
        console.log(`⏱️ ${performanceLog[uniqueName].originalName}: ${performanceLog[uniqueName].duration.toFixed(2)}ms`);
    }
}

function printPerformanceSummary() {
    console.log('=== PERFORMANCE SUMMARY ===');
    Object.keys(performanceLog).forEach(key => {
        if (performanceLog[key].duration !== null) {
            console.log(`${key}: ${performanceLog[key].duration.toFixed(2)}ms`);
        }
    });
    console.log('=== END SUMMARY ===');
}

/**
 * УМНОЕ КЭШИРОВАНИЕ с автоматической инвалидацией
 */
function getCachedData(cacheKey, fetchFunction, ttlMinutes = 10) {
    const now = Date.now();
    
    // Инициализируем глобальный кэш если нужно
    if (!projectsWorkloadCache.globalCache) {
        projectsWorkloadCache.globalCache = {};
    }
    
    const cached = projectsWorkloadCache.globalCache[cacheKey];
    
    // Проверяем валидность кэша
    if (cached && (now - cached.timestamp < ttlMinutes * 60 * 1000)) {
        cacheHits++;
        console.log(`🔄 Cache HIT: ${cacheKey}`);
        return Promise.resolve(cached.data);
    }
    
    cacheMisses++;
    console.log(`🔄 Cache MISS: ${cacheKey}`);
    
    return fetchFunction().then(result => {
        projectsWorkloadCache.globalCache[cacheKey] = {
            data: result,
            timestamp: now
        };
        return result;
    });
}

/**
 * Получение всех пользователей из группы пользователей
 */
async function getUsersFromUserGroup(userGroupName) {
    if (!userGroupName) {
        return [];
    }
    
    const cacheKey = `user_group_${userGroupName}`;
    
    return getCachedData(cacheKey, async () => {
        try {
            console.log(`Fetching users from user group: ${userGroupName}`);
            
            // Получаем документ User Group
            const userGroupDoc = await frappe.db.get_doc('User Group', userGroupName);
            
            if (!userGroupDoc || !userGroupDoc.user_group_members) {
                console.log('No user group members found');
                return [];
            }
            
            // Собираем всех пользователей из таблицы user_group_members
            const users = userGroupDoc.user_group_members
                .map(member => member.user)
                .filter(user => user); // Убираем пустые значения
            
            console.log(`Found ${users.length} users in group ${userGroupName}:`, users);
            return users;
            
        } catch (error) {
            console.error(`Error fetching user group ${userGroupName}:`, error);
            return [];
        }
    }, 10); // Кэш на 10 минут
}

function getProjectsWorkloadRowDataFromElement(frm, rowElement) {
    if (!rowElement) return null;

    const rowIndex = parseInt(rowElement.getAttribute('data-row-index'));
    if (isNaN(rowIndex)) return null;

    const dt = frm && frm.projects_workload_dt;
    const datamanager = dt && dt.datamanager;

    // DataTable.getRow() возвращает внутреннюю строку-ячеек. Исходный объект
    // берем по meta.rowIndex, чтобы не путать видимый DOM index и данные таблицы.
    if (datamanager && typeof datamanager.getRow === 'function') {
        const dtRow = datamanager.getRow(rowIndex);
        if (dtRow && dtRow._isUser) return dtRow;

        const sourceIndex = dtRow && dtRow.meta ? parseInt(dtRow.meta.rowIndex) : rowIndex;
        if (!isNaN(sourceIndex) && projectsWorkloadTableData && projectsWorkloadTableData[sourceIndex]) {
            return projectsWorkloadTableData[sourceIndex];
        }
    }

    if (datamanager && datamanager.data && datamanager.data[rowIndex]) {
        return datamanager.data[rowIndex];
    }

    return projectsWorkloadTableData && projectsWorkloadTableData[rowIndex] ? projectsWorkloadTableData[rowIndex] : null;
}

// ========== ФУНКЦИИ ДВОЙНОГО КЛИКА ==========

/**
 * Обработчик двойного клика по ячейке таблицы
 */
function setupProjectsWorkloadDoubleClick(frm) {
    if (!frm.projects_workload_dt) return;
    
    frm.projects_workload_dt.wrapper.addEventListener('dblclick', function(e) {
        const target = e.target;
        const cell = target.closest('.dt-cell');
        
        if (!cell) return;
        
        const rowElement = cell.closest('.dt-row');
        if (!rowElement) return;
        
        const rowData = getProjectsWorkloadRowDataFromElement(frm, rowElement);
        if (!rowData) {
            console.log('No row data found for clicked row element');
            return;
        }
        
        const columnIndex = parseInt(cell.getAttribute('data-col-index'));
        if (isNaN(columnIndex)) return;
        
        const columns = frm.projects_workload_dt.datamanager.columns;
        const column = columns[columnIndex];
        
        console.log('Double click - row data:', rowData);
        console.log('Double click - column:', column);
        
        handleDoubleClick(rowData, column);
    });
}

/**
 * Обработка двойного клика в зависимости от типа данных
 */
async function handleDoubleClick(rowData, column) {
    console.log('Processing double click - rowData:', rowData);
    console.log('Processing double click - column id:', column.id);
    
    if (column.id === 'participant' && rowData._isProject && rowData._project) {
        console.log('Opening workload for project:', rowData._project);
        openProjectTab(rowData._project, 'custom_workload');
    } 
    else if (column.id && column.id.startsWith('workload_') && rowData._isProject && rowData._project) {
        console.log('Opening workload project from workload cell for:', rowData._project);
        openProjectTab(rowData._project, 'custom_workload');
    }
    else if (column.id && column.id.startsWith('workload_') && rowData._isAbsenceRow && rowData._email) {
        console.log('Opening user absence for:', rowData._email);
        const dateMatch = column.id.match(/workload_(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
            const dateStr = dateMatch[1];
            await openUserAbsence(rowData._email, dateStr);
        } else {
            console.log('No date found in column id');
            frappe.msgprint(__('Could not determine date for opening absence request'));
        }
    } else {
        console.log('Double click not handled - rowData._isProject:', rowData._isProject, 'rowData._isUser:', rowData._isUser, 'rowData._isAbsenceRow:', rowData._isAbsenceRow);
    }
}

/**
 * Переход в загрузку конкретного проекта
 * Используем стандартный механизм Frappe с хэшем URL для открытия конкретной вкладки
 */
function openProjectTab(projectName, fieldName) {  
    if (!projectName) return;  
    
    console.log('🔄 Opening project:', projectName);  
    
    function _debounce(fn, ms) {
        let t = null;
        return function(...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), ms);
        };
    }
    
    function goToField() {
        cur_frm.scroll_to_field(fieldName);
    }
    
    // Открываем проект
    frappe.set_route('Form', 'Project', projectName).then( _debounce( goToField, 300 ) );
}

/**
 * Открытие заявки на отсутствие пользователя
 */
async function openUserAbsence(userEmail, dateStr) {
    if (!userEmail || !dateStr) {
        console.log('No user email or date provided');
        frappe.msgprint(__('User and date must be specified to open absence request'));
        return;
    }
    
    console.log('Opening user absence for:', userEmail, 'on date:', dateStr);
    
    try {
        const absences = await frappe.db.get_list('Application For Leave', {
            fields: ['name', 'alfrom_date', 'alto_date'],
            filters: [
                ['lauser', '=', userEmail],
                ['status', '=', 'Согласовано'],
                ['alfrom_date', '<=', dateStr],
                ['alto_date', '>=', dateStr]
            ],
            limit: 1
        });
        
        if (absences && absences.length > 0) {
            const absence = absences[0];
            console.log('Found absence:', absence.name, 'for date:', dateStr);
            frappe.set_route('Form', 'Application For Leave', absence.name);
        } else {
            console.log('No absence found for user:', userEmail, 'on date:', dateStr);
            frappe.msgprint(__('No absence request found for user {0} on date {1}', [userEmail, dateStr]));
        }
        
    } catch (error) {
        console.error('Error fetching absence data:', error);
        frappe.msgprint(__('Error searching for absence request'));
    }
}

// ========== ОПТИМИЗИРОВАННЫЕ ФУНКЦИИ ==========

/**
 * Проверка является ли день нерабочим
 */
function isNonWorkingDay(date, holidays) {
    if (!date || !holidays || holidays.length === 0) {
        return false;
    }
    
    const targetDateStr = date;
    
    for (let i = 0; i < holidays.length; i++) {
        const holiday = holidays[i];
        if (holiday.date === targetDateStr) {
            return true;
        }
    }
    
    return false;
}

/**
 * Получение правильного календаря для строки
 */
function getHolidaysForRow(data, period) {
    if (!data) return [];

    const userHolidays = data._userHolidays || [];

    if (data._isUser || data._isAbsenceRow) {
        return userHolidays;
    }

    if (data._isProject) {
        const projectHolidays = data._projectHolidays || [];
        if (!userHolidays.length) {
            return projectHolidays;
        }
        if (!projectHolidays.length) {
            return userHolidays;
        }
        return projectHolidays.concat(userHolidays);
    }

    return [];
}

/**
 * Проверка, попадает ли дата в период отсутствия пользователя
 */
function isUserAbsentOnDate(userEmail, date, userAbsences) {
    if (!userAbsences || !userAbsences[userEmail]) {
        return null;
    }
    
    const userAbsenceList = userAbsences[userEmail];
    const targetDate = date;
    
    for (const absence of userAbsenceList) {
        if (!absence.from_date || !absence.to_date) continue;
        
        if (targetDate >= absence.from_date && targetDate <= absence.to_date) {
            return {
                isAbsent: true,
                type: absence.type || __('Absence'),
                alfrom_hours: absence.alfrom_hours,
                alto_hours: absence.alto_hours
            };
        }
    }
    
    return null;
}

/**
 * Форматирование текста для отсутствий
 */
function formatAbsenceText(absenceType) {
    return __("Abs.");
}

/**
 * Защита от множественных вызовов - дебаунсинг
 */
function debouncedLoadProjectsWorkloadData(frm, immediate = false, options = {}) {
    options = withPwrLoadActualOptions(options);
    if (projectsWorkloadLoadTimeout) {
        clearTimeout(projectsWorkloadLoadTimeout);
        projectsWorkloadLoadTimeout = null;
    }

    if (isProjectsWorkloadLoading) {
        pendingPwrReloadOptions = {
            ...(pendingPwrReloadOptions || {}),
            ...options,
        };
        if (options.loadActual != null) {
            pendingPwrReloadOptions.loadActual = options.loadActual;
        }
        return;
    }
    
    if (immediate) {
        load_projects_workload_data(frm, options);
        return;
    }
    
    projectsWorkloadLoadTimeout = setTimeout(() => {
        if (!isProjectsWorkloadLoading) {
            load_projects_workload_data(frm, options);
        }
    }, 300);
}

/**
 * Добавление строк отсутствий в данные таблицы
 */
function addAbsenceRowsToTableData(table_data, userAbsences) {
    if (!table_data || !userAbsences) return table_data;
    
    const newTableData = [];
    let currentUser = null;
    let userProjects = [];
    
    console.log('Adding absence rows to table data as child elements...');
    
    for (let i = 0; i < table_data.length; i++) {
        const row = table_data[i];
        
        if (row._isUser && row._email) {
            if (currentUser) {
                newTableData.push(...userProjects);
                
                if (userAbsences[currentUser._email] && userAbsences[currentUser._email].length > 0) {
                    const absenceRow = createAbsenceRow(currentUser, userAbsences[currentUser._email]);
                    newTableData.push(absenceRow);
                }
            }
            
            currentUser = row;
            userProjects = [];
            newTableData.push(row);
        }
        else if (row._isProject && currentUser) {
            row._absences = userAbsences[currentUser._email] || [];
            row._email = currentUser._email;
            userProjects.push(row);
        }
        else {
            newTableData.push(row);
        }
    }
    
    if (currentUser) {
        newTableData.push(...userProjects);
        
        if (userAbsences[currentUser._email] && userAbsences[currentUser._email].length > 0) {
            const absenceRow = createAbsenceRow(currentUser, userAbsences[currentUser._email]);
            newTableData.push(absenceRow);
        }
    }
    
    console.log('Added absence rows as child elements. Original rows:', table_data.length, 'New rows:', newTableData.length);
    return newTableData;
}

/**
 * Создание строки отсутствий для пользователя
 */
function createAbsenceRow(userRow, userAbsenceData) {
    const absenceRow = {
        participant: __("Absences"),
        _isAbsenceRow: true,
        _email: userRow._email,
        _absences: userAbsenceData || [],
        _parent: userRow.participant,
        _treeDepth: 1,
        indent: 1,
        expandable: false
    };
    
    return absenceRow;
}

function createLazyProjectPlaceholderRow(userRow) {
    return {
        participant: __("Loading project details..."),
        _isLazyPlaceholder: true,
        _email: userRow._email,
        _parent: userRow.participant,
        _treeDepth: 1,
        indent: 1,
        expandable: false
    };
}

function addLazyProjectPlaceholdersToTableData(tableData) {
    if (!tableData || !tableData.length) return tableData;

    const result = [];
    for (let i = 0; i < tableData.length; i++) {
        const row = tableData[i];
        result.push(row);

        if (row && row._isUser && row._email && row.expandable && row._detailsLoaded === false) {
            const nextRow = tableData[i + 1];
            const hasChildRow = nextRow && nextRow.indent > row.indent;
            if (!hasChildRow) {
                result.push(createLazyProjectPlaceholderRow(row));
            }
        }
    }

    return result;
}

/**
 * ISS-2026-00865 V4: получение данных через V2 API с режимами user_totals/user_projects.
 */
async function get_projects_workload_data(frm, options = {}) {
    const mode = options.mode || 'user_totals';
    const limit = options.limit || projectsWorkloadPaging.limit;
    const offset = options.offset || 0;
    const detailUser = options.detail_user || '';

    console.log('=== START PWR V4 DATA LOAD ===');
    console.log('Request parameters:', {mode, limit, offset, detailUser, worker_wtype: getPwrWorkerWtype(options), view_type: currentViewType, period_range: currentPeriodRange});
    console.time("get_projects_workload_data_v2");
    
    try {
        const result = await frappe.call({
            method: 'get_projects_workload_data_v2',
            args: {
                user: frm.doc.user || '',
                project: frm.doc.project || '',
                project_portfolio: frm.doc.project_portfolio || '', // ISS-2026-00625
                user_group: frm.doc.user_group || '',
                view_type: currentViewType,
                period_range: currentPeriodRange,
                period_anchor_date: window.pwrPeriodAnchorDate || frappe.datetime.get_today(),
                load_actual: getPwrLoadActualFlag(options),
                worker_wtype: getPwrWorkerWtype(options),
                mode: mode,
                limit: limit,
                offset: offset,
                detail_user: detailUser
            },
            freeze: mode === 'user_totals' && offset === 0,
            freeze_message: __('Fetching projects workload data...')
        });
        
        console.timeEnd("get_projects_workload_data_v2");
        console.log('Full V2 server response:', result);
        
        if (!result) {
            throw new Error(__('No response from server'));
        }
        if (!result.message) {
            throw new Error(__('Empty response from server'));
        }
        if (result.message.error) {
            throw new Error(__('Server error: {0}', [result.message.error]));
        }
        
        const message = result.message;
        const tree_data = message.tree_data || [];
        const periods = message.periods || [];
        let finalTableData = tree_data;
        
        if (mode !== 'user_projects' && tree_data.length > 0) {
            const userAbsencesFromServer = {};
            tree_data.forEach(row => {
                if (row._isUser && row._email && row._absences && row._absences.length > 0) {
                    userAbsencesFromServer[row._email] = row._absences;
                }
            });
            finalTableData = addAbsenceRowsToTableData(tree_data, userAbsencesFromServer);
            finalTableData = addLazyProjectPlaceholdersToTableData(finalTableData);
        }
        
        return {
            tree_data: finalTableData,
            periods: periods,
            mode: message.mode || mode,
            limit: message.limit || limit,
            offset: message.offset || offset,
            next_offset: message.next_offset,
            has_more: !!message.has_more,
            total_users: message.total_users || 0,
            users_count: message.users_count || 0,
            projects_count: message.projects_count || 0,
            assignments_count: message.assignments_count || 0,
            performance: message.performance || {}
        };
        
    } catch (error) {
        console.error('Error loading projects workload data:', error);
        frappe.msgprint(__('Error loading data: {0}', [error.message]));
        return {
            tree_data: [],
            periods: [],
            mode: mode,
            has_more: false,
            total_users: 0
        };
    }
}

/**
 * Расчет доступных часов с поиском в родительских данных
 */
function getAvailableHoursOnDate(data, dateStr, baseHours) {
    if (!data || !data._email) {
        return baseHours;
    }
    
    let userAbsences = data._absences || [];
    
    if (userAbsences.length === 0 || !hasInformativeAbsences(userAbsences)) {
        const userAbsencesFromCache = findUserAbsencesInCache(data._email);
        if (userAbsencesFromCache && userAbsencesFromCache.length > 0) {
            userAbsences = userAbsencesFromCache;
        }
    }
    
    if (!userAbsences || userAbsences.length === 0) {
        return baseHours;
    }
    
    const targetDate = dateStr;
    
    for (const absence of userAbsences) {
        if (!absence.from_date || !absence.to_date) continue;
        
        if (targetDate >= absence.from_date && targetDate <= absence.to_date) {
            if (targetDate === absence.from_date && absence.alfrom_hours) {
                const absenceHours = parseFloat(absence.alfrom_hours) || 0;
                return Math.max(0, baseHours - absenceHours);
            }
            else if (targetDate === absence.to_date && absence.alto_hours) {
                const absenceHours = parseFloat(absence.alto_hours) || 0;
                return Math.max(0, baseHours - absenceHours);
            }
            else {
                console.log(`   ✅ Full absence in middle: 0h available`);
                return 0;
            }
        }
    }
    
    return baseHours;
}

/**
 * Проверяет есть ли в отсутствиях информативные данные (часы)
 */
function hasInformativeAbsences(absences) {
    return absences.some(absence => 
        absence.alfrom_hours || absence.alto_hours
    );
}

/**
 * Ищет отсутствия пользователя в глобальном кэше
 */
function findUserAbsencesInCache(userEmail) {
    if (!projectsWorkloadTableData || !userEmail) return null;
    
    const userRow = projectsWorkloadTableData.find(row => 
        row._isUser && row._email === userEmail && row._absences && row._absences.length > 0
    );
    
    return userRow ? userRow._absences : null;
}

// ========== НОВЫЕ ФУНКЦИИ ДЛЯ УНИФИЦИРОВАННОЙ СТРОКИ ФИЛЬТРОВ ==========

/**
 * Создание фильтра формы в компактном виде БЕЗ ЛЕЙБЛОВ
 */
function createFormFilter(frm, fieldname, label, container) {
    let field = frm.fields_dict[fieldname];
    if (!field) return;
    
    let filterWrapper = $(`
        <div class="form-filter-wrapper">
            <div class="filter-control"></div>
        </div>
    `).appendTo(container);
    
    let $originalControl = field.$wrapper;
    $originalControl.appendTo(filterWrapper.find('.filter-control'));
    
    if ($originalControl.find('input').length) {
        $originalControl.find('input').attr('placeholder', label);
    }
    
    if ($originalControl.find('.control-label').length) {
        $originalControl.find('.control-label').hide();
    }

    $originalControl.find('.help-box, .clearfix').hide();
    $originalControl.css({ marginBottom: 0, paddingBottom: 0 });
    $originalControl.find('.form-group, .control-input-wrapper, .control-input').css({
        marginBottom: 0,
        paddingBottom: 0,
    });
    
    return filterWrapper;
}

function compactPwrFilterControl($wrapper) {
    if (!$wrapper || !$wrapper.length) {
        return;
    }
    $wrapper.find('.help-box, .clearfix, .control-label').hide();
    $wrapper.css({ marginBottom: 0, paddingBottom: 0 });
    $wrapper.find('.form-group, .control-input-wrapper, .control-input').css({
        marginBottom: 0,
        paddingBottom: 0,
    });
}

function normalizeProjectsWorkloadFiltersRow(frm) {
    if (!frm || !frm.wrapper) {
        return;
    }
    const $row = $(frm.wrapper).find('.projects-workload-filters-section .unified-filters-row');
    if (!$row.length) {
        return;
    }
    $row.find('.help-box, .clearfix, .control-label').hide();
    $row.find('.form-filter-wrapper .frappe-control').each(function () {
        compactPwrFilterControl($(this));
    });
    $row.find('.pwr-filters-flow .frappe-control').each(function () {
        compactPwrFilterControl($(this));
    });
}

function applyProjectsWorkloadGridViewportHeight(frm) {
    if (
        project_workload_assignment &&
        project_workload_assignment.charts &&
        typeof project_workload_assignment.charts.syncGridViewportHeight === 'function'
    ) {
        project_workload_assignment.charts.syncGridViewportHeight(frm);
        return;
    }

    if (!frm || !frm.wrapper) return;

    const $root = $(frm.wrapper);
    const $gridRoot = $root.find('.projects_workload_report').first();
    const $gridSlot = $gridRoot.find('.projects-workload-table').first();
    if (!$gridRoot.length || !$gridSlot.length) return;

    $gridRoot.css({
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        height: 'auto',
        minHeight: 0,
        maxHeight: 'none',
    });

    const gridTop = $gridSlot[0].getBoundingClientRect().top;
    const gridHeight = Math.max(320, window.innerHeight - gridTop - 16);

    $gridSlot.css({
        height: gridHeight,
        minHeight: gridHeight,
        maxHeight: gridHeight,
        flex: '1 1 auto',
        minWidth: 0,
        boxSizing: 'border-box',
    });
    $gridRoot.find('.projects-workload-ag-grid').css({
        height: gridHeight,
        minHeight: 0,
        maxHeight: gridHeight,
        margin: 0,
        flex: '1 1 auto',
        boxSizing: 'border-box',
    });
}

function applyProjectsWorkloadSectionLayout(frm) {
    if (!frm || !frm.wrapper) return;

    const $root = $(frm.wrapper);
    const zeroBox = { padding: 0, margin: 0, width: '100%', maxWidth: '100%', boxSizing: 'border-box' };

    const $tableSection = $root.find('[data-fieldname="section_break_nyf1"]');
    if ($tableSection.length) {
        $tableSection.css({
            padding: 0,
            marginLeft: 0,
            marginRight: 0,
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
        });
        $tableSection.find('.section-head').hide();
        $tableSection.find('.section-body').css(zeroBox);
        $tableSection.find('.form-column, [class*="col-sm-"], [class*="col-md-"]').css({
            ...zeroBox,
            flex: '0 0 100%',
        });

        const $field = $tableSection.find('[data-fieldname="projects_workload_report"]');
        $field.css(zeroBox);
        $field.find('.control-label').hide();
        $field.find('.frappe-control, .control-input-wrapper, .control-input, .form-group').css(zeroBox);
    }

    applyProjectsWorkloadGridViewportHeight(frm);

    if (!frm._pwrViewportResizeAttached) {
        frm._pwrViewportResizeAttached = true;
        $(window).on('resize.projectsWorkloadReport', frappe.utils.debounce(() => {
            if (cur_frm && cur_frm.doctype === 'Projects Workload Report') {
                applyProjectsWorkloadGridViewportHeight(cur_frm);
            }
        }, 150));
    }

    $root.find('.projects-workload-filters-section .projects-workload-controls.unified-filters-row').css({
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 8,
        paddingRight: 8,
        margin: 0,
        border: 'none',
        background: 'transparent',
    });
    normalizeProjectsWorkloadFiltersRow(frm);
}

function getProjectsWorkloadFiltersSection(frm) {
    if (!frm || !frm.wrapper) return $();
    const $wrapper = $(frm.wrapper);
    const $userField = $wrapper.find('[data-fieldname="user"]');
    if (!$userField.length) return $();
    const $section = $userField.closest('.form-section');
    if (!$section.length) return $();
    const $body = $section.find('.section-body').first();
    return $body.length ? $body : $section;
}

function ensureProjectsWorkloadFiltersSection(frm) {
    if (frm._pwrFiltersRowInitialized) {
        return;
    }

    const $section = getProjectsWorkloadFiltersSection(frm);
    if (!$section.length) {
        return;
    }

    $section.closest('.form-section').addClass('projects-workload-filters-section');
    createUnifiedFilterRow(frm, $section);
    normalizeProjectsWorkloadFiltersRow(frm);
    $section.find('.form-column').each(function() {
        if (!$(this).find('.frappe-control').length) {
            $(this).hide();
        }
    });
    frm._pwrFiltersRowInitialized = true;
    applyProjectsWorkloadSectionLayout(frm);
}

/**
 * Создание единой строки фильтров и кнопок БЕЗ ЛЕЙБЛОВ
 */
function createUnifiedFilterRow(frm, $wrapper) {
    let controls, $flow, buttonsContainer;
    if (pwrShared().createPwrFilterRowShell) {
        ({ controls, $flow, buttonsContainer } = pwrShared().createPwrFilterRowShell($wrapper, {
            extraRowClass: 'pb-1',
        }));
    } else {
        controls = $('<div class="projects-workload-controls unified-filters-row d-flex flex-nowrap align-items-start w-100 pb-1"></div>').appendTo($wrapper);
        $flow = $('<div class="pwr-filters-flow d-flex flex-wrap align-items-center"></div>').appendTo(controls);
        buttonsContainer = $('<div class="pwr-filters-group pwr-filters-group--right filter-buttons d-flex flex-shrink-0 align-items-center justify-content-end"></div>').appendTo(controls);
    }

    createFormFilter(frm, 'user', __('User'), $flow);
    createFormFilter(frm, 'project', __('Project'), $flow);
    createFormFilter(frm, 'project_portfolio', __('Project Portfolio'), $flow); // ISS-2026-00625
    createFormFilter(frm, 'user_group', __('User Group'), $flow);
    createPwrWorkerTypeFilter($flow);
    createPwrShowFactFilter($flow);
    createPwrPeriodNavFilter($flow, frm);
    createViewTypeDropdown($flow);
    createPeriodRangeDropdown($flow);

    const filterBtnClass = pwrShared().PWR_FILTER_BTN_CLASS || 'btn btn-default btn-sm';

    let refreshBtn = $(`
        <button class="${filterBtnClass}" title="${__('Refresh Data')}">
            ↻
        </button>
    `).appendTo(buttonsContainer);
    
    refreshBtn.on('click', function() {
        console.log('🔄 Manual refresh triggered');
        projectsWorkloadCache = {
            userData: {}, taskCache: {}, projectCache: {}, assignmentCache: {}, 
            userAbsenceCache: {}, workerCache: {}, timesheetTemplateCache: {},
            workingHoursOverrideCache: {}, userWorkingHoursCache: {}, 
            holidayCache: {}, globalCache: {}
        };
        cacheHits = 0;
        cacheMisses = 0;
        debouncedLoadProjectsWorkloadData(frm, true);
    });
    
    let clearBtn = $(`
        <button class="${filterBtnClass}" title="${__('Clear All Filters')}">
            ☒
        </button>
    `).appendTo(buttonsContainer);
    
    clearBtn.on('click', function() {
        console.log('🔄 Clear all filters triggered');
        // ISS-2026-00625: Не очищаем user для не-менеджеров
        /*
        if (!hasProjectManagerRole()) {
            frm.set_value('project', '');
            frm.set_value('project_portfolio', '');
            frm.set_value('user_group', '');
        } else {
            frm.set_value('user', '');
            frm.set_value('project', '');
            frm.set_value('project_portfolio', '');
            frm.set_value('user_group', '');
        }
        */
        frm.set_value('user', '');
        frm.set_value('project', '');
        frm.set_value('project_portfolio', '');
        frm.set_value('user_group', '');
        window.pwrWorkerWtype = '';
        $('.pwr-filter-worker-wtype-select').val('');

        frm.filters_changed = true;
        debouncedLoadProjectsWorkloadData(frm, true);
    });
    
    return controls;
}

/**
 * Создание выпадающего списка периода отображения
 */
function createPeriodRangeDropdown(container) {
    const control = frappe.ui.form.make_control({
        parent: container[0],
        df: {
            fieldtype: 'Select',
            fieldname: "period_range",
            options: [
                {value: 'quarter', label: __('Quarter')},
                {value: 'half_year', label: __('Half Year')},
                {value: 'year', label: __('Year')}
            ],
            default: currentPeriodRange,
            change: function() {
                if (this.value && this.value !== currentPeriodRange) {
                    currentPeriodRange = this.value;
                    window.currentPeriodRange = currentPeriodRange;
                    resetPwrPeriodAnchorForFilters();
                    console.log(`🔄 Period range changed to: ${currentPeriodRange}`);
                    if (cur_frm) {
                        debouncedLoadProjectsWorkloadData(cur_frm, true);
                    }
                }
            }
        },
        render_input: true
    });
    
    control.set_value(currentPeriodRange);
    
    if (control.$label) {
        control.$label.hide();
    }
    compactPwrFilterControl(control.$wrapper);
    
    return control;
}

function createViewTypeDropdown(container) {
    const control = frappe.ui.form.make_control({
        parent: container[0],
        df: {
            fieldtype: 'Select',
            fieldname: "view_type",
            options: [
                {value: 'daily', label: __('Daily')},
                {value: 'weekly', label: __('Weekly')},
                {value: 'monthly', label: __('Monthly')}
            ],
            default: currentViewType,
            change: function() {
                if (this.value && this.value !== currentViewType) {
                    currentViewType = this.value;
                    window.currentViewType = currentViewType;
                    window.pwrViewType = currentViewType;
                    resetPwrPeriodAnchorForFilters();
                    console.log(`🔄 View type changed to: ${currentViewType}`);
                    if (cur_frm) {
                        debouncedLoadProjectsWorkloadData(cur_frm, true);
                    }
                }
            }
        },
        render_input: true
    });
    
    control.set_value(currentViewType);
    
    if (control.$label) {
        control.$label.hide();
    }
    compactPwrFilterControl(control.$wrapper);
    
    return control;
}

/**
 * Форматирование заголовка месяца
 */
function formatMonthHeader(year, month) {
    const monthNames = [
        __('Jan'), __('Feb'), __('Mar'), __('Apr'), __('May'), __('Jun'),
        __('Jul'), __('Aug'), __('Sep'), __('Oct'), __('Nov'), __('Dec')
    ];
    
    return `${monthNames[month - 1]}<br><small>${year}</small>`;
}

/**
 * Форматирование заголовка недели
 */
function formatWeekHeader(period) {
    const startDate = frappe.datetime.str_to_obj(period.start_date);
    const endDate = frappe.datetime.str_to_obj(period.end_date);
    
    const formatDayMonth = (date) => {
        const day = date.getDate();
        const month = date.getMonth() + 1;
        return `${day}.${month}`;
    };
    
    const startStr = formatDayMonth(startDate);
    const endStr = formatDayMonth(endDate);
    
    return `${startStr}<br><small>${endStr}</small>`;
}

/**
 * Форматирование заголовка дня
 */
function formatDateHeader(dateString) {
    if (!dateString) return "";
    
    const dateObj = frappe.datetime.str_to_obj(dateString);
    const dayNames = [
        __('Sun'), __('Mon'), __('Tue'), __('Wed'), __('Thu'), __('Fri'), __('Sat')
    ];
    
    const dayMonth = frappe.datetime.str_to_user(dateString).split('-').slice(0, 2).join('.');
    const weekday = dayNames[dateObj.getDay()];
    
    return `${dayMonth}<br><small>${weekday}</small>`;
}

/**
 * Функция форматирования ячеек - ТОЛЬКО ДИНАМИЧЕСКИЕ ЗНАЧЕНИЯ
 */
function get_projects_workload_columns_definition(periods) {
    let columns = [];
    
    columns.push({
        name: __("Participant / Project"),
        id: "participant",
        width: 220,
        sortable: true,
        editable: false,
        focusable: false,
        treeView: true,
        format: (value, row, column, data) => {
            if (!data) {
                return `<div class="projects-workload-cell pwr-participant-cell"></div>`;
            }
            
            if (data._isProject) {
                return `<div class="projects-workload-cell pwr-participant-cell project-display">
                    <div class="project-name">${data.project || __('No Project')}</div>
                </div>`;
            } else if (data._isLazyPlaceholder) {
                return `<div class="projects-workload-cell pwr-participant-cell project-display projects-workload-lazy-placeholder">
                    <div class="project-name text-muted">${__("Loading projects...")}</div>
                </div>`;
            } else if (data._isAbsenceRow) {
                return `<div class="projects-workload-cell pwr-participant-cell project-display">
                    <div class="project-name">${__("Absences")}</div>
                </div>`;
            } else {
                const userData = data.user_data || {};
                const fullName = userData.full_name || value;
                const email = userData.email || value;
                const userImage = userData.user_image;
                const buildAvatar = (window.ProjectsWorkloadAgGrid && window.ProjectsWorkloadAgGrid.buildUserAvatarHtml)
                    || function(name, image, prefix) {
                        const initial = ((name && name.charAt(0)) || 'U').toUpperCase();
                        if (!image) {
                            return `<div class="${prefix}-placeholder">${initial}</div>`;
                        }
                        return `<span class="${prefix}-wrap"><img src="${image}" class="${prefix}" alt="${name}" onerror="this.style.display='none';var p=this.parentElement&&this.parentElement.querySelector('.${prefix}-placeholder');if(p)p.classList.add('pwr-avatar-visible');"><div class="${prefix}-placeholder">${initial}</div></span>`;
                    };
                if (!data._cachedAvatarHtml || data._cachedAvatarSrc !== userImage) {
                    data._cachedAvatarSrc = userImage;
                    data._cachedAvatarHtml = buildAvatar(fullName, userImage, 'projects-user-avatar');
                }
                const avatarHtml = data._cachedAvatarHtml;
                
                return `<div class="projects-workload-cell pwr-participant-cell">
                    <div class="projects-user-display">
                        ${avatarHtml}
                        <div class="projects-user-info">
                            <div class="projects-user-fullname" title="${fullName}">${fullName}</div>
                            <div class="projects-user-email" title="${email}">${email}</div>
                        </div>
                    </div>
                </div>`;
            }
        }
    });
    
    periods.forEach(period => {
        let columnName = "";
        
        if (currentViewType === 'daily') {
            columnName = formatDateHeader(period.date);
        } else if (currentViewType === 'weekly') {
            columnName = formatWeekHeader(period);
        } else {
            columnName = formatMonthHeader(period.year, period.month);
        }
        
        columns.push({
            name: columnName,
            id: period.key,
            width: 55,
            sortable: false,
            editable: false,
            focusable: false,
            format: (value, row, column, data) => {
                if (!data) {
                    return `<div class="projects-workload-cell"></div>`;
                }
                
                if (data._isLazyPlaceholder) {
                    return `<div class="projects-workload-cell"></div>`;
                }

                if (currentViewType === 'daily') {
                    const holidaysToUse = getHolidaysForRow(data, period);
                    const isNonWorking = isNonWorkingDay(period.date, holidaysToUse);
                    
                    if (isNonWorking) {
                        const projectHolidays = data._projectHolidays || [];
                        const userHolidays = data._userHolidays || [];
                        
                        const isProjectHoliday = isNonWorkingDay(period.date, projectHolidays);
                        const isUserHoliday = isNonWorkingDay(period.date, userHolidays);
                        
                        let tooltip = __('Project Holiday');
                        
                        if (isUserHoliday && !isProjectHoliday) {
                            tooltip = __('User Holiday');
                        } else if (isUserHoliday && isProjectHoliday) {
                            tooltip = __('Project & User Holiday');
                        }
                        
                        return `<div class="projects-workload-cell projects-weekend-cell" title="${tooltip}"></div>`;
                    }
                }
                
                if (data._isAbsenceRow) {
                    if (data._email && data._absences && data._absences.length > 0) {
                        const userAbsence = isUserAbsentOnDate(data._email, period.date, {[data._email]: data._absences});
                        if (userAbsence && userAbsence.isAbsent) {
                            const displayText = formatAbsenceText(userAbsence.type);
                            const tooltipText = userAbsence.type || __('Absence');
                            return `
                                <div class="projects-workload-cell projects-absence-cell" title="${tooltipText}">
                                    <div class="projects-absence-text">${displayText}</div>
                                </div>
                            `;
                        }
                    }
                    
                    return `<div class="projects-workload-cell"></div>`;
                }
                
                let hours = parseFloat(value) || 0;
                let percentage = 0;
                let tooltip = '';
                let availableHours = 0;

                if (currentViewType === 'daily') {
                    const workingHours = data._workingHours || {};
                    const baseHours = workingHours[period.date] || 8;
                    availableHours = getAvailableHoursOnDate(data, period.date, baseHours);
                    
                    if (availableHours > 0) {
                        percentage = Math.round((hours / availableHours) * 100);
                    }
                    
                    let tooltipParts = [];
                    tooltipParts.push(`${__("Base working hours")}: ${baseHours.toFixed(1)}h`);
                    
                    if (availableHours !== baseHours) {
                        const absenceHours = baseHours - availableHours;
                        tooltipParts.push(`${__("Absence hours")}: ${absenceHours.toFixed(1)}h`);
                        tooltipParts.push(`${__("Available hours")}: ${availableHours.toFixed(1)}h`);
                    }
                    
                    tooltipParts.push(`${__("Workload")}: ${hours.toFixed(1)}h (${percentage}%)`);
                    
                    tooltip = tooltipParts.join('\n');
                    
                } else if (currentViewType === 'weekly') {
                    availableHours = 40;
                    
                    if (data._workingHours && period.start_date && period.end_date) {
                        let calculatedHours = 0;
                        let currentDate = new Date(period.start_date);
                        const endDate = new Date(period.end_date);
                        const holidaysToUse = getHolidaysForRow(data, period);
                        
                        while (currentDate <= endDate) {
                            const dateString = frappe.datetime.obj_to_str(currentDate);
                            
                            const isNonWorking = isNonWorkingDay(dateString, holidaysToUse);
                            
                            if (!isNonWorking) {
                                const workingHours = data._workingHours || {};
                                const userHoursOnDate = workingHours[dateString];
                                const baseHours = userHoursOnDate !== undefined ? userHoursOnDate : 8;
                                const availableOnDate = getAvailableHoursOnDate(data, dateString, baseHours);
                                calculatedHours = calculatedHours + availableOnDate;
                            }
                            currentDate.setDate(currentDate.getDate() + 1);
                        }
                        
                        if (calculatedHours > 0) {
                            availableHours = calculatedHours;
                        }
                    }
                    
                    if (availableHours > 0) {
                        percentage = Math.round((hours / availableHours) * 100);
                    }
                    tooltip = `${__("Weekly available hours")}: ${availableHours.toFixed(1)}h\n${__("Workload")}: ${hours.toFixed(1)}h (${percentage}%)`;
                } else {
                    availableHours = 160;
                    
                    if (data._workingHours && period.start_date && period.end_date) {
                        let calculatedHours = 0;
                        let currentDate = new Date(period.start_date);
                        const endDate = new Date(period.end_date);
                        const holidaysToUse = getHolidaysForRow(data, period);
                        
                        while (currentDate <= endDate) {
                            const dateString = frappe.datetime.obj_to_str(currentDate);
                            
                            const isNonWorking = isNonWorkingDay(dateString, holidaysToUse);
                            
                            if (!isNonWorking) {
                                const workingHours = data._workingHours || {};
                                const userHoursOnDate = workingHours[dateString];
                                const baseHours = userHoursOnDate !== undefined ? userHoursOnDate : 8;
                                const availableOnDate = getAvailableHoursOnDate(data, dateString, baseHours);
                                calculatedHours = calculatedHours + availableOnDate;
                            }
                            currentDate.setDate(currentDate.getDate() + 1);
                        }
                        
                        if (calculatedHours > 0) {
                            availableHours = calculatedHours;
                        }
                    }
                    
                    if (availableHours > 0) {
                        percentage = Math.round((hours / availableHours) * 100);
                    }
                    tooltip = `${__("Monthly available hours")}: ${availableHours.toFixed(1)}h\n${__("Workload")}: ${hours.toFixed(1)}h (${percentage}%)`;
                }

                if (isPwrShowFactEnabled()) {
                    const periodKey = (column && column.id) || period.key;
                    const actualHours = parseFloat(data[`${periodKey}_actual`]) || 0;
                    const planFactHtml = renderPwrPlanFactCell({
                        planHours: hours,
                        actualHours,
                        availableHours,
                        tooltip,
                        cellClass: "projects-workload-cell",
                        visualPrefix: "projects-workload",
                    });
                    if (planFactHtml) {
                        return planFactHtml;
                    }
                }

                if (pwrShared().renderPlanOnlyWorkloadCell) {
                    return pwrShared().renderPlanOnlyWorkloadCell({
                        planHours: hours,
                        percentage,
                        tooltip,
                        cellClass: "projects-workload-cell",
                        visualPrefix: "projects-workload",
                    });
                }
            }
        });
    });
    
    return columns;
}

function resetProjectsWorkloadPagingState() {
    projectsWorkloadPaging.offset = 0;
    projectsWorkloadPaging.nextOffset = 0;
    projectsWorkloadPaging.hasMore = false;
    projectsWorkloadPaging.totalUsers = 0;
    projectsWorkloadPaging.isLoadingMore = false;
    loadedProjectDetailsByUser = {};
}

function setProjectsWorkloadLoadMoreState(frm, isLoading = false) {
    return;
}

function setupProjectsWorkloadAutoLoadOnScroll(frm) {
    if (!frm || !frm.projects_workload_dt || !frm.projects_workload_dt.wrapper) return;

    const wrapper = frm.projects_workload_dt.wrapper;
    const scrollable = wrapper.querySelector('.ag-body-viewport')
        || wrapper.querySelector('.dt-scrollable')
        || (frm.projects_workload_dt.bodyScrollable || null);
    if (!scrollable || scrollable._projectsWorkloadAutoLoadAttached) return;

    scrollable._projectsWorkloadAutoLoadAttached = true;
    scrollable.addEventListener('scroll', function() {
        if (!projectsWorkloadPaging.hasMore || projectsWorkloadPaging.isLoadingMore || isProjectsWorkloadLoading) {
            return;
        }

        const distanceToBottom = scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight;
        if (distanceToBottom <= 160) {
            loadMoreProjectsWorkloadUsers(frm);
        }
    });
}

function collapseProjectsWorkloadRows(frm) {
    if (!frm || !frm.projects_workload_dt || !frm.projects_workload_dt.rowmanager) return;

    const rowmanager = frm.projects_workload_dt.rowmanager;
    if (typeof rowmanager.collapseAllNodes === 'function') {
        rowmanager.collapseAllNodes();
    }
}

function getPwrWorkerWtype(options) {
    if (options && options.workerWtype != null) {
        return options.workerWtype || '';
    }
    return window.pwrWorkerWtype || '';
}

function getProjectsWorkloadRowHeight() {
    return pwrShared().getPwrRowHeight ? pwrShared().getPwrRowHeight() : (isPwrShowFactEnabled() ? 54 : 40);
}

function refreshProjectsWorkloadTable(frm, tableData, periods, collapseAll = true) {
    if (!frm.projects_workload_dt) return;

    currentProjectsWorkloadPeriods = periods || currentProjectsWorkloadPeriods || [];
    projectsWorkloadTableData = tableData || [];
    const columns = get_projects_workload_columns_definition(currentProjectsWorkloadPeriods);
    frm.projects_workload_dt.refresh(projectsWorkloadTableData, columns, {
        rowHeight: getProjectsWorkloadRowHeight(),
        workloadPeriods: currentProjectsWorkloadPeriods,
        workloadViewType: currentViewType,
        showFact: isPwrShowFactEnabled(),
    });
    if (collapseAll) {
        collapseProjectsWorkloadRows(frm);
    }

    setTimeout(() => {
        applyProjectsWorkloadGridViewportHeight(frm);
        if (collapseAll) {
            collapseProjectsWorkloadRows(frm);
        }
        setupProjectsWorkloadDoubleClick(frm);
        setupProjectsWorkloadLazyProjectLoading(frm);
        setupProjectsWorkloadAutoLoadOnScroll(frm);
    }, 100);
}

function findInsertIndexForProjectRows(userEmail) {
    let userIndex = -1;
    for (let i = 0; i < projectsWorkloadTableData.length; i++) {
        const row = projectsWorkloadTableData[i];
        if (row && row._isUser && row._email === userEmail) {
            userIndex = i;
            break;
        }
    }
    if (userIndex < 0) return -1;

    let insertIndex = userIndex + 1;
    while (insertIndex < projectsWorkloadTableData.length) {
        const row = projectsWorkloadTableData[insertIndex];
        if (!row) break;
        if (row._isProject && row._email === userEmail) {
            insertIndex = insertIndex + 1;
            continue;
        }
        break;
    }
    return insertIndex;
}

function removeProjectRowsForUser(userEmail) {
    const filtered = [];
    for (let i = 0; i < projectsWorkloadTableData.length; i++) {
        const row = projectsWorkloadTableData[i];
        if (row && row._email === userEmail && (row._isProject || row._isLazyPlaceholder)) {
            continue;
        }
        filtered.push(row);
    }
    projectsWorkloadTableData = filtered;
}

function openProjectsWorkloadUserRow(frm, userEmail) {
    if (!frm || !frm.projects_workload_dt || !frm.projects_workload_dt.rowmanager) return;
    if (!userEmail) return;

    const rowmanager = frm.projects_workload_dt.rowmanager;
    if (typeof rowmanager.openSingleNode === 'function') {
        rowmanager.openSingleNode(`user:${userEmail}`);
    }
}

async function loadProjectDetailsForUser(frm, userRow) {
    if (!userRow || !userRow._email) return;
    const userEmail = userRow._email;

    if (loadedProjectDetailsByUser[userEmail]) {
        return;
    }

    loadedProjectDetailsByUser[userEmail] = true;
    userRow._detailsLoaded = true;
    console.log('Loading project details for user:', userEmail);

    const result = await get_projects_workload_data(frm, {
        mode: 'user_projects',
        detail_user: userEmail,
        limit: projectsWorkloadPaging.limit,
        offset: 0,
        loadActual: getPwrLoadActualFlag(),
        workerWtype: getPwrWorkerWtype(),
    });

    const projectRows = result.tree_data || [];
    removeProjectRowsForUser(userEmail);
    const insertIndex = findInsertIndexForProjectRows(userEmail);
    if (insertIndex < 0) return;

    projectRows.forEach(row => {
        if (row) {
            delete row._agRowId;
        }
    });
    projectsWorkloadTableData.splice(insertIndex, 0, ...projectRows);
    refreshProjectsWorkloadTable(frm, projectsWorkloadTableData, currentProjectsWorkloadPeriods, false);
    openProjectsWorkloadUserRow(frm, userEmail);
}

function setupProjectsWorkloadLazyProjectLoading(frm) {
    if (!frm.projects_workload_dt || !frm.projects_workload_dt.wrapper) return;
    const wrapper = frm.projects_workload_dt.wrapper;

    if (wrapper._projectsWorkloadLazyListenerAttached) return;
    wrapper._projectsWorkloadLazyListenerAttached = true;

    wrapper.addEventListener('click', function(e) {
        if (!e.target || !e.target.closest) return;

        const toggle = e.target.closest('.dt-tree-node__toggle');
        const cell = toggle ? toggle.closest('.dt-cell') : e.target.closest('.dt-cell');
        if (!cell) return;

        const columnIndex = parseInt(cell.getAttribute('data-col-index'));
        if (!toggle && columnIndex !== 0) return;

        const rowElement = cell.closest('.dt-row');
        if (!rowElement) return;

        const rowData = getProjectsWorkloadRowDataFromElement(frm, rowElement);
        if (!rowData || !rowData._isUser || !rowData._email) return;

        loadProjectDetailsForUser(frm, rowData);
    }, true);
}

window.loadProjectDetailsForUser = loadProjectDetailsForUser;
window.handleDoubleClick = handleDoubleClick;
window.debouncedLoadProjectsWorkloadData = debouncedLoadProjectsWorkloadData;
window.load_projects_workload_data = load_projects_workload_data;

$(document).on("pwr-workload-data-reload", function (_event, frm, meta) {
    if (!frm || frm.doctype !== "Projects Workload Report") {
        return;
    }
    if (meta && meta.periodAnchor) {
        window.pwrPeriodAnchorDate = meta.periodAnchor;
    }
    if (meta && typeof meta.showFact === "boolean") {
        window.pwrShowFact = meta.showFact;
    }
    if (frm._pwrUpdatePeriodNavLabel) {
        frm._pwrUpdatePeriodNavLabel();
    }
    debouncedLoadProjectsWorkloadData(frm, true, {
        loadActual: getPwrLoadActualFlag(),
        workerWtype: window.pwrWorkerWtype || '',
    });
});

/**
 * Загрузка данных для таблицы загрузки проектов
 */
async function load_projects_workload_data(frm, options = {}) {
    if (isProjectsWorkloadLoading) {
        pendingPwrReloadOptions = {
            ...(pendingPwrReloadOptions || {}),
            ...options,
        };
        if (options.loadActual != null) {
            pendingPwrReloadOptions.loadActual = options.loadActual;
        }
        console.log('Projects workload data is already loading, queued reload');
        return;
    }
    
    try {
        isProjectsWorkloadLoading = true;
        resetProjectsWorkloadPagingState();
        console.log('START loading projects workload data, view type:', currentViewType, 'period range:', currentPeriodRange);
        console.time("load_projects_workload_data");
        
        if (frm.projects_workload_dt) {
            frm.projects_workload_dt.freeze(__("Loading data..."));
        }
        
        const result = await get_projects_workload_data(frm, {
            mode: 'user_totals',
            limit: projectsWorkloadPaging.limit,
            offset: 0,
            ...options,
        });

        projectsWorkloadPaging.offset = 0;
        projectsWorkloadPaging.nextOffset = result.next_offset;
        projectsWorkloadPaging.hasMore = !!result.has_more;
        projectsWorkloadPaging.totalUsers = result.total_users || 0;
        currentProjectsWorkloadPeriods = result.periods || [];
        projectsWorkloadTableData = result.tree_data || [];
        
        console.log('Projects workload data loaded, rows:', projectsWorkloadTableData.length, 'total users:', projectsWorkloadPaging.totalUsers);

        if (frm.projects_workload_dt) {
            frm.projects_workload_dt.unfreeze();
            refreshProjectsWorkloadTable(frm, projectsWorkloadTableData, currentProjectsWorkloadPeriods, true);
        }
        setProjectsWorkloadLoadMoreState(frm, false);
    } catch (error) {
        console.error('Error loading projects workload data:', error);
        if (frm.projects_workload_dt) {
            frm.projects_workload_dt.unfreeze();
        }
        frappe.msgprint(__('Error loading data: {0}', [error.message]));
    } finally {
        isProjectsWorkloadLoading = false;
        console.timeEnd("load_projects_workload_data");
        console.log('END loading projects workload data');
        if (pendingPwrReloadOptions) {
            const pending = pendingPwrReloadOptions;
            pendingPwrReloadOptions = null;
            debouncedLoadProjectsWorkloadData(frm, true, pending);
        }
    }
}

async function loadMoreProjectsWorkloadUsers(frm) {
    if (projectsWorkloadPaging.isLoadingMore || !projectsWorkloadPaging.hasMore) {
        return;
    }

    try {
        projectsWorkloadPaging.isLoadingMore = true;
        setProjectsWorkloadLoadMoreState(frm, true);

        const result = await get_projects_workload_data(frm, {
            mode: 'user_totals',
            limit: projectsWorkloadPaging.limit,
            offset: projectsWorkloadPaging.nextOffset || 0,
            loadActual: getPwrLoadActualFlag(),
            workerWtype: getPwrWorkerWtype(),
        });

        const newRows = result.tree_data || [];
        projectsWorkloadTableData = projectsWorkloadTableData.concat(newRows);
        projectsWorkloadPaging.nextOffset = result.next_offset;
        projectsWorkloadPaging.hasMore = !!result.has_more;
        projectsWorkloadPaging.totalUsers = result.total_users || projectsWorkloadPaging.totalUsers;

        // Ключи строк стабильны (user:email), раскрытие и ширина колонки сохраняются в AG Grid.
        refreshProjectsWorkloadTable(frm, projectsWorkloadTableData, currentProjectsWorkloadPeriods, false);
    } catch (error) {
        console.error('Error loading more users:', error);
        frappe.msgprint(__('Error loading more users: {0}', [error.message]));
    } finally {
        projectsWorkloadPaging.isLoadingMore = false;
        setProjectsWorkloadLoadMoreState(frm, false);
    }
}

/**
 * Отрисовка таблицы загрузки проектов
 */
async function render_projects_workload_table(frm) {
    console.time("render_projects_workload_table");
    try {
        await ensureProjectsWorkloadAgGrid();
    } catch (error) {
        console.error('Error loading ProjectsWorkloadAgGrid:', error);
        frappe.msgprint(__('Could not load table component: {0}', [error.message]));
        console.timeEnd("render_projects_workload_table");
        return;
    }

    let wrapper = frm.get_field("projects_workload_report");
    if (!wrapper) return;
    
    let $wrapper = wrapper.$wrapper;
    if (!$wrapper || !$wrapper.length) return;
    
    $wrapper.addClass("projects_workload_report");
    
    if (frm.projects_workload_table_initialized && frm.projects_workload_dt) {
        console.log('🔄 Table already initialized, loading data...');
        applyProjectsWorkloadSectionLayout(frm);
        debouncedLoadProjectsWorkloadData(frm, true, { loadActual: getPwrLoadActualFlag() });
        return;
    }
    
    ensureProjectsWorkloadFiltersSection(frm);

    if (!frm.projects_workload_table_initialized) {
        $wrapper.empty();
        frm.projects_workload_table_initialized = true;
    }

    let table_container = $('<div class="projects-workload-table"></div>').appendTo($wrapper);

    function init_projects_workload_table() {
        let temp_columns = [
            {
                name: __("Participant / Project"),
                id: "participant",
                width: 220,
                sortable: true,
                editable: false,
                focusable: false,
                treeView: true,
                format: (value, row, column, data) => {
                    return `<div class="projects-workload-cell">${__("Loading...")}</div>`;
                }
            }
        ];
        
        if (frm.projects_workload_dt) {
            frm.projects_workload_dt.destroy();
        }
    
        frm.projects_workload_dt = new ProjectsWorkloadAgGrid.Table(table_container[0], {
            columns: temp_columns,
            data: [],
            freezeMessage: __("Loading data..."),
            isRowExpandable: row => !!(row && row.expandable)
        });
    
        debouncedLoadProjectsWorkloadData(frm, true);
    }

    init_projects_workload_table();
    applyProjectsWorkloadSectionLayout(frm);
    setTimeout(() => applyProjectsWorkloadSectionLayout(frm), 0);
    console.timeEnd("render_projects_workload_table");
}

// Клиентский скрипт для Doctype "Projects Workload Report"
frappe.ui.form.on("Projects Workload Report", {
    onload: function(frm) {
        // ISS-2026-00625: Скрываем статус документа
        frm.page.clear_indicator();
        // ISS-2026-00625: Для не-менеджеров принудительно устанавливаем текущего пользователя и скрываем поле
        /*
        if (!hasProjectManagerRole()) {
            frm.set_value('user', frappe.session.user);
            // Скрываем поле визуально
            frm.toggle_display('user', false);
            console.log('ISS-2026-00625: Non-manager - setting user filter to:', frappe.session.user, 'and hiding field');
        } else {
            // Для менеджеров показываем поле
            frm.toggle_display('user', true);
            console.log('ISS-2026-00625: Manager user detected. User filter is visible.');
        }
        */
        
        // ===== СНАЧАЛА проверяем sessionStorage =====
        const shouldFilter = sessionStorage.getItem('workload_report_should_filter');
        if (shouldFilter === 'true') {
            const userEmail = sessionStorage.getItem('workload_report_filter_user');
            
            sessionStorage.removeItem('workload_report_should_filter');
            sessionStorage.removeItem('workload_report_filter_user');
            
            // ISS-2026-00625: Для не-менеджеров игнорируем sessionStorage
            /*
            if (!hasProjectManagerRole()) {
                console.log('ISS-2026-00625: Non-manager - ignoring sessionStorage filter');
            } else
            */
            if (userEmail) {
                console.log('Setting filter from session in onload:', userEmail);
                frm.set_value('user', userEmail);
                frm.set_value('project', '');
                frm.set_value('project_portfolio', '');
                frm.set_value('user_group', '');
            }
        } else if (hasProjectManagerRole()) {
            // Только для менеджеров очищаем все фильтры
            frm.set_value('user', '');
            frm.set_value('project', '');
            frm.set_value('project_portfolio', '');
            frm.set_value('user_group', '');
        }
        // ISS-2026-00625: Для не-менеджеров user уже установлен в setupUserFilterForNonManager
        
        console.log("Projects Workload Report: onload");
        projectsWorkloadCache = {
            userData: {},
            taskCache: {},
            projectCache: {},
            assignmentCache: {},
            userAbsenceCache: {},
            workerCache: {},
            timesheetTemplateCache: {},
            workingHoursOverrideCache: {},
            userWorkingHoursCache: {},
            holidayCache: {},
            globalCache: {}
        };
        projectsWorkloadTableData = [];
        currentProjectsWorkloadPeriods = [];
        resetProjectsWorkloadPagingState();
        isProjectsWorkloadRedrawing = false;
        isProjectsWorkloadLoading = false;
        frm._pwrFiltersRowInitialized = false;
        frm.projects_workload_table_initialized = false;
        cacheHits = 0;
        cacheMisses = 0;
        
        if (typeof applyProjectsWorkloadStyle === 'function') {
            applyProjectsWorkloadStyle();
        }
        
        frm.filters_changed = false;
        frm.page.set_primary_action(null);
        frm.page.clear_menu();
    },
    
    refresh: function(frm) {
        console.log("Projects Workload Report: refresh");
        // ISS-2026-00625: Скрываем статус документа при каждом обновлении
        frm.page.clear_indicator();
        
        // ISS-2026-00625: Для не-менеджеров всегда устанавливаем текущего пользователя и скрываем поле
        /*
        if (!hasProjectManagerRole()) {
            frm.set_value('user', frappe.session.user);
            // Скрываем поле визуально при каждом refresh
            frm.toggle_display('user', false);
            console.log('ISS-2026-00625: Non-manager refresh - keeping user filter hidden');
        } else {
            // Для менеджеров показываем поле
            frm.toggle_display('user', true);
            console.log('ISS-2026-00625: Manager refresh - user filter is visible.');
        }
        */
        // // ISS-2026-00933 --- исправления по п.1
        // ===== ДОБАВЛЕНО: Проверяем sessionStorage при refresh (повторное открытие) =====
        const shouldFilter = sessionStorage.getItem('workload_report_should_filter');
        const userEmail = sessionStorage.getItem('workload_report_filter_user');
        
        // Очищаем sessionStorage сразу
        sessionStorage.removeItem('workload_report_should_filter');
        sessionStorage.removeItem('workload_report_filter_user');
        
        // Применяем фильтр из sessionStorage для всех пользователей
        if (shouldFilter === 'true' && userEmail) {
            console.log('Setting filter from session in refresh:', userEmail);
            frm.set_value('project', '');
            frm.set_value('project_portfolio', '');
            frm.set_value('user_group', '');
            frm.set_value('user', userEmail);
        }
        
        // ISS-2026-00625: Для менеджеров обрабатываем sessionStorage
        /*
        if (hasProjectManagerRole()) {
            if (shouldFilter === 'true' && userEmail) {
                console.log('Setting filter from session in refresh:', userEmail);
                frm.set_value('project', '');
                frm.set_value('project_portfolio', '');
                frm.set_value('user_group', '');
                frm.set_value('user', userEmail);
            }
        } else {
            console.log('ISS-2026-00625: Non-manager refresh - keeping user filter as current user');
        }
        // ===== КОНЕЦ ДОБАВЛЕННОГО БЛОКА =====
        */
        
        frm.page.set_primary_action(null);
        frm.disable_save();
        render_projects_workload_table(frm);
    },
    
    user: function(frm) {
        // ISS-2026-00625: Для не-менеджеров игнорируем изменения поля user
        /*
        if (!hasProjectManagerRole()) {
            console.log('ISS-2026-00625: Non-manager cannot change user filter');
            frm.set_value('user', frappe.session.user);
            return;
        }
        */
        
        console.log('User filter changed:', frm.doc.user);
        frm.filters_changed = true;
        debouncedLoadProjectsWorkloadData(frm);
    },
    
    project: function(frm) {
        console.log('Project filter changed:', frm.doc.project);
        frm.filters_changed = true;
        debouncedLoadProjectsWorkloadData(frm);
    },
    
    // НОВЫЙ ОБРАБОТЧИК ДЛЯ PROJECT PORTFOLIO
    project_portfolio: function(frm) {
        console.log('Project Portfolio filter changed:', frm.doc.project_portfolio);
        frm.filters_changed = true;
        debouncedLoadProjectsWorkloadData(frm);
    },
    
    user_group: function(frm) {
        console.log('User Group filter changed:', frm.doc.user_group);
        frm.filters_changed = true;
        debouncedLoadProjectsWorkloadData(frm);
    }
});
/*
frappe.ui.form.on("Projects Workload Report", {
    onload: function(frm) {
        frm.set_value('user', '');
        frm.set_value('project', '');
        frm.set_value('user_group', '');
        
        console.log("Projects Workload Report: onload");
        projectsWorkloadCache = {
            userData: {},
            taskCache: {},
            projectCache: {},
            assignmentCache: {},
            userAbsenceCache: {},
            workerCache: {},
            timesheetTemplateCache: {},
            workingHoursOverrideCache: {},
            userWorkingHoursCache: {},
            holidayCache: {},
            globalCache: {}
        };
        projectsWorkloadTableData = [];
        currentProjectsWorkloadPeriods = [];
        resetProjectsWorkloadPagingState();
        isProjectsWorkloadRedrawing = false;
        isProjectsWorkloadLoading = false;
        cacheHits = 0;
        cacheMisses = 0;
        
        if (typeof applyProjectsWorkloadStyle === 'function') {
            applyProjectsWorkloadStyle();
        }
        
        frm.filters_changed = false;
        frm.page.set_primary_action(null);
        frm.page.clear_menu();
    },
    
    refresh: function(frm) {
        console.log("Projects Workload Report: refresh");
        frm.page.set_primary_action(null);
        frm.disable_save();
        render_projects_workload_table(frm);
    },
    
    //projects_workload_report: function(frm) {
        //console.log("Projects Workload Report: projects_workload_report field activated");
        //setTimeout(() => render_projects_workload_table(frm), 100);
    //},
    
    user: function(frm) {
        console.log('User filter changed:', frm.doc.user);
        frm.filters_changed = true;
        debouncedLoadProjectsWorkloadData(frm);
    },
    
    project: function(frm) {
        console.log('Project filter changed:', frm.doc.project);
        frm.filters_changed = true;
        debouncedLoadProjectsWorkloadData(frm);
    },
    
    user_group: function(frm) {
        console.log('User Group filter changed:', frm.doc.user_group);
        frm.filters_changed = true;
        debouncedLoadProjectsWorkloadData(frm);
    }
});
*/
