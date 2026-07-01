// === Frappe Script Metadata ===
// Managed By: pull_iss_2026_00865_scripts_demodev.py
// Kind: Client Script
// Script Name: Project_Workload
// Reference DocType: Project
// View: Form
// Enabled: 1
// Fixture Modified: 2026-06-04 12:53:37.529296
// Module: Project Workload Assignment
// Content SHA256: 620cf534367931973652e6c34b705205c18c0337b06210fb049c48471b8177fb
// === /Frappe Script Metadata ===

//ВАРИАНТ С ВЛОЖЕННЫМИ ЗАДАЧАМИ
// ========== КОНФИГУРАЦИЯ И ПЕРЕМЕННЫЕ ==========
var WL_DEBUG = typeof WL_DEBUG !== "undefined" ? WL_DEBUG : false;

let isProjectWorkloadLoading = false;
let projectWorkloadLoadTimeout = null;

// Кэш для данных
let projectWorkloadCache = {
    globalCache: {}
};

// Глобальные переменные
let projectWorkloadTableData = [];
let currentViewType = 'daily';
let currentPeriodRange = 'quarter';
window.currentViewType = currentViewType;
window.projectWorkloadViewType = currentViewType;
window.currentPeriodRange = currentPeriodRange;
window.pwrShowFact = !!window.pwrShowFact;

function pwrShared() {
    return project_workload_assignment.pwrShared || {};
}

function isPwrShowFactEnabled() {
    return pwrShared().isPwrShowFactEnabled ? pwrShared().isPwrShowFactEnabled(window.cur_frm) : !!window.pwrShowFact;
}

function getPwrLoadActualFlag(options) {
    return pwrShared().getPwrLoadActualFlag
        ? pwrShared().getPwrLoadActualFlag(options)
        : (isPwrShowFactEnabled() ? 1 : 0);
}

function renderPwrPlanFactCell(options) {
    return pwrShared().renderPwrPlanFactCell
        ? pwrShared().renderPwrPlanFactCell(options)
        : null;
}

function getPwrRowHeight() {
    return pwrShared().getPwrRowHeight ? pwrShared().getPwrRowHeight() : (isPwrShowFactEnabled() ? 54 : 40);
}

function syncPwrProjectGlobals() {
    window.currentViewType = currentViewType;
    window.projectWorkloadViewType = currentViewType;
    window.currentPeriodRange = currentPeriodRange;
    window.displayDateFrom = displayDateFrom;
    window.displayDateTo = displayDateTo;
}

function getPwrPeriodAnchorLabel(frm) {
    return pwrShared().getPwrPeriodAnchorLabel
        ? pwrShared().getPwrPeriodAnchorLabel(frm || cur_frm, () => {
            ensureDatesInitialized();
            return `${frappe.datetime.str_to_user(displayDateFrom)} — ${frappe.datetime.str_to_user(displayDateTo)}`;
        })
        : '';
}

function triggerPwrWorkloadDataReload(frm) {
    syncPwrProjectGlobals();
    if (pwrShared().triggerPwrWorkloadDataReload) {
        pwrShared().triggerPwrWorkloadDataReload(frm || cur_frm, {
            showFact: isPwrShowFactEnabled(),
            periodAnchor: displayDateFrom,
        });
    }
}

function shiftProjectWorkloadPeriod(direction) {
    ensureDatesInitialized();
    displayDateFrom = frappe.datetime.add_months(displayDateFrom, direction);
    displayDateTo = frappe.datetime.add_months(displayDateTo, direction);
    syncPwrProjectGlobals();
    updateDateControls();
    triggerPwrWorkloadDataReload(cur_frm);
}

function createPwrPeriodNavFilter(container, frm) {
    return pwrShared().createPwrPeriodNavFilter
        ? pwrShared().createPwrPeriodNavFilter(container, frm, {
            fallbackPeriodLabel: () => getPwrPeriodAnchorLabel(frm),
            onShiftPeriod: (activeFrm, direction) => {
                if (
                    project_workload_assignment.charts &&
                    typeof project_workload_assignment.charts.shiftPeriod === "function"
                ) {
                    project_workload_assignment.charts.shiftPeriod(activeFrm, direction);
                    return;
                }
                shiftProjectWorkloadPeriod(direction);
            },
        })
        : $();
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

function resetProjectWorkloadPeriodAnchor() {
    displayDateFrom = getDefaultDateFrom();
    displayDateTo = null;
    ensureDatesInitialized();
    syncPwrProjectGlobals();
    updateDateControls();
}

function requestProjectWorkloadChartReload(frm) {
    if (!frm || frm.doctype !== 'Project') {
        return;
    }
    syncPwrProjectGlobals();
    $(document).trigger('pwr-workload-chart-reload', [frm]);
}

// Даты отображения - ИНИЦИАЛИЗИРУЕМ ПРИ ОПРЕДЕЛЕНИИ
let displayDateFrom = null;
let displayDateTo = null;
let projectDates = null;

// Ссылки на контролы дат для синхронизации
let dateFromControl = null;
let dateToControl = null;

// Глобальные метаданные для доступа в функциях форматирования
window.projectWorkloadMetadata = {};

// Система измерения производительности
const performanceLog = {};

function ensureProjectWorkloadAgGrid() {
    if (pwrShared().ensureAgGrid) {
        return pwrShared().ensureAgGrid();
    }
    return Promise.reject(new Error('pwrShared.ensureAgGrid is not available'));
}

function startTimer(name) {
    const uniqueName = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    performanceLog[uniqueName] = {
        start: performance.now(),
        end: null,
        duration: null,
        originalName: name
    };
    return uniqueName;
}

function endTimer(uniqueName) {
    if (performanceLog[uniqueName]) {
        performanceLog[uniqueName].end = performance.now();
        performanceLog[uniqueName].duration = performanceLog[uniqueName].end - performanceLog[uniqueName].start;
        if (WL_DEBUG) console.log(`⏱️ ${performanceLog[uniqueName].originalName}: ${performanceLog[uniqueName].duration.toFixed(2)}ms`);
    }
}

/**
 * УМНОЕ КЭШИРОВАНИЕ
 */
function getCachedData(cacheKey, fetchFunction, ttlMinutes = 10, noCache = false) {
    const now = Date.now();
    
    if (!projectWorkloadCache.globalCache) {
        projectWorkloadCache.globalCache = {};
    }
    
    // Если принудительное обновление - пропускаем кэш
    if (noCache) {
        if (WL_DEBUG) console.log(`🔄 Cache SKIP (force refresh): ${cacheKey}`);
        return fetchFunction().then(result => {
            projectWorkloadCache.globalCache[cacheKey] = {
                data: result,
                timestamp: now
            };
            return result;
        });
    }
    
    const cached = projectWorkloadCache.globalCache[cacheKey];
    
    // Проверяем валидность кэша
    if (cached && (now - cached.timestamp < ttlMinutes * 60 * 1000)) {
        if (WL_DEBUG) console.log(`🔄 Cache HIT: ${cacheKey}`);
        return Promise.resolve(cached.data);
    }
    
    if (WL_DEBUG) console.log(`🔄 Cache MISS: ${cacheKey}`);
    
    return fetchFunction().then(result => {
        projectWorkloadCache.globalCache[cacheKey] = {
            data: result,
            timestamp: now
        };
        return result;
    });
}

// ========== ФУНКЦИИ ДЛЯ ДАТ ==========

/**
 * Получение текущей даты в формате yyyy-mm-dd
 */
function getCurrentDateYYYYMMDD() {
    return frappe.datetime.get_today();
}

/**
 * ПОЛУЧЕНИЕ ДАТЫ НАЧАЛА ПО УМОЛЧАНИЮ (ТЕКУЩАЯ ДАТА)
 */
function getDefaultDateFrom() {
    return getCurrentDateYYYYMMDD();
}

/**
 * ПОЛУЧЕНИЕ ДАТЫ ОКОНЧАНИЯ ПО УМОЛЧАНИЮ
 * Берем минимальную из:
 * 1. Дата окончания проекта (если есть)
 * 2. Дата, рассчитанная от текущей даты на выбранный период
 */
function getDefaultDateTo() {
    const today = getCurrentDateYYYYMMDD();
    let periodDate;
    
    // Рассчитываем дату от текущей даты на выбранный период
    switch(currentPeriodRange) {
        case 'half_year':
            periodDate = frappe.datetime.add_months(today, 6);
            break;
        case 'year':
            periodDate = frappe.datetime.add_months(today, 12);
            break;
        case 'quarter':
        default:
            periodDate = frappe.datetime.add_months(today, 3);
            break;
    }
    
    if (WL_DEBUG) console.log(`Period date from ${currentPeriodRange}:`, periodDate);
    
    // Если есть дата проекта, берем минимальную
    if (projectDates && projectDates.end_date) {
        if (WL_DEBUG) console.log('Project end date:', projectDates.end_date);
        
        // Сравниваем даты и берем меньшую
        if (projectDates.end_date < periodDate) {
            if (WL_DEBUG) console.log('Using project end date (it is earlier)');
            return projectDates.end_date;
        } else {
            if (WL_DEBUG) console.log('Using period date (project end date is later)');
            return periodDate;
        }
    }
    
    // Если нет даты проекта, используем период
    if (WL_DEBUG) console.log('No project end date, using period date');
    return periodDate;
}

/**
 * Валидация дат
 */
function validateDates(dateFrom, dateTo) {
    const from = frappe.datetime.str_to_obj(dateFrom);
    const to = frappe.datetime.str_to_obj(dateTo);
    
    if (from > to) {
        frappe.show_alert(__('Дата "С" не может быть больше даты "По"'), 5);
        return false;
    }
    
    // Максимальный период - 1 год
    const maxDate = new Date(from);
    maxDate.setFullYear(maxDate.getFullYear() + 1);
    
    if (to > maxDate) {
        frappe.show_alert(__('Максимальный период отображения - 1 год'), 5);
        return false;
    }
    
    return true;
}

/**
 * Гарантированная инициализация дат
 * ИЗМЕНЕНО: теперь с текущей даты и до конца проекта (или +квартал)
 */
function ensureDatesInitialized() {
    if (!displayDateFrom || !displayDateTo) {
        if (WL_DEBUG) console.log('Initializing dates from current date forward...');
        
        // Дата начала - всегда текущая дата
        displayDateFrom = getDefaultDateFrom();
        
        // Дата окончания - конец проекта или +квартал
        displayDateTo = getDefaultDateTo();
        
        syncPwrProjectGlobals();
        
        if (WL_DEBUG) console.log('Dates initialized:', {
            from: displayDateFrom,
            to: displayDateTo,
            source: projectDates?.end_date ? 'project end date' : 'default quarter'
        });
    }
}

/**
 * Обновление значений в контролах дат
 */
function updateDateControls() {
    if (dateFromControl && displayDateFrom) {
        if (WL_DEBUG) console.log('Updating dateFrom control with:', displayDateFrom);
        dateFromControl.set_value(displayDateFrom);
    }
    if (dateToControl && displayDateTo) {
        if (WL_DEBUG) console.log('Updating dateTo control with:', displayDateTo);
        dateToControl.set_value(displayDateTo);
    }
}

// ========== ОПТИМИЗИРОВАННЫЕ ФУНКЦИИ ==========

/**
 * Проверка является ли день нерабочим
 * ВАЖНО: weekly_off = true означает плановый выходной (суббота/воскресенье)
 * Такие дни НЕ считаются нерабочими для целей загрузки
 */
function isNonWorkingDay(dateStr, holidays, userEmail) {
    // если есть индекс — используем его
    const idx = window.projectWorkloadIndexed;
    if (idx) {
        // сначала проектные праздники
        if (idx.projectHolidaySet && idx.projectHolidaySet.has(dateStr)) {
            //console.log(`📅 ${dateStr} is project holiday`);
            return true;
        }

        // userEmail может быть undefined — тогда пропускаем
        if (userEmail && idx.userHolidayMap && idx.userHolidayMap[userEmail]) {
            if (idx.userHolidayMap[userEmail].has(dateStr)) {
                //console.log(`📅 ${dateStr} is user holiday for ${userEmail}`);
                return true;
            }
        }

        // если в индексах ничего не найдено — это не нерабочий
        return false;
    }

    // fallback на старую логику, если индекс не инициализирован
    if (!dateStr || !holidays || holidays.length === 0) {
        return false;
    }

    for (let i = 0; i < holidays.length; i++) {
        const holiday = holidays[i];
        if (holiday.date === dateStr) {
            if (holiday.weekly_off) return false;
            //console.log(`📅 ${dateStr} is holiday (fallback)`);
            return true;
        }
    }

    return false;
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
    
    // Получаем норму часов пользователя на эту дату из метаданных
    const metadata = window.projectWorkloadMetadata || {};
    const userDailyHours = metadata.user_daily_hours || {};
    const userBaseHours = userDailyHours[userEmail]?.[targetDate] || 8;
    
    for (const absence of userAbsenceList) {
        if (!absence.from_date || !absence.to_date) continue;
        
        if (targetDate >= absence.from_date && targetDate <= absence.to_date) {
            // Проверяем, является ли этот день частичным отсутствием ----старая логика закомментирована
            //const isPartial = (
                //(targetDate === absence.from_date && absence.alfrom_hours) ||
                //(targetDate === absence.to_date && absence.alto_hours)
            //);
            
            // ISS-2026-00933 --- исправления по п.2 
            const fromHours = parseFloat(absence.alfrom_hours) || 0;
            const toHours = parseFloat(absence.alto_hours) || 0;
            
            // Частичное отсутствие — только если часы > 0, но МЕНЬШЕ полной нормы рабочего дня
            // Если часы равны норме (например, 8 из 8) — это полное отсутствие, а не частичное
            const isPartial = (
                (targetDate === absence.from_date && fromHours > 0 && fromHours < userBaseHours) ||
                (targetDate === absence.to_date && toHours > 0 && toHours < userBaseHours)
            );
            
            return {
                isAbsent: true,
                isPartial: isPartial,  // ← ДОБАВЛЯЕМ ФЛАГ
                type: absence.type || __('Отсутствие'),
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
    return __("Отс.");
}

/**
 * Защита от множественных вызовов - дебаунсинг
 */
function debouncedLoadProjectWorkloadData(frm, immediate = false, forceRefresh = false) {
    if (projectWorkloadLoadTimeout) {
        clearTimeout(projectWorkloadLoadTimeout);
        projectWorkloadLoadTimeout = null;
    }
    
    if (immediate && !isProjectWorkloadLoading) {
        load_project_workload_data(frm, forceRefresh);
        return;
    }
    
    projectWorkloadLoadTimeout = setTimeout(() => {
        if (!isProjectWorkloadLoading) {
            load_project_workload_data(frm, forceRefresh);
        }
    }, 300);
}


/**
 * Расчет доступных часов с учетом отсутствий
 * Убедитесь, что эта функция правильно считает частичные отсутствия
 */
 function getAvailableHoursOnDate(data, dateStr, baseHours) {
    if (!data || !data.email) return baseHours;

    const email = data.email;
    const idx = window.projectWorkloadIndexed;
    // ключ кеша для одной отрисовки/загрузки
    window._pw_cache = window._pw_cache || { availableHours: {} };
    const cacheKey = `${email}_${dateStr}`;
    if (window._pw_cache.availableHours.hasOwnProperty(cacheKey)) {
        return window._pw_cache.availableHours[cacheKey];
    }

    // default
    let resultHours = baseHours;

    if (idx && idx.userAbsenceMap && Array.isArray(idx.userAbsenceMap[email])) {
        // быстрый поиск по интервалам, т.к. массив отсортирован.
        const dateTs = frappe.datetime.str_to_obj(dateStr).getTime();
        const intervals = idx.userAbsenceMap[email];

        // бинарный/линейный поиск: массив как правило маленький, можно do linear scan
        for (let i = 0; i < intervals.length; i++) {
            const a = intervals[i];
            if (dateTs < a.from_ts) {
                // т.к. отсортировано, дальнейшие интервалы тоже позже
                break;
            }
            if (dateTs >= a.from_ts && dateTs <= a.to_ts) {
                // частичный первый день
                if (dateStr === a.from_date && a.alfrom_hours) {
                    const absenceHours = parseFloat(a.alfrom_hours) || 0;
                    resultHours = Math.max(0, baseHours - absenceHours);
                }
                // частичный последний день
                else if (dateStr === a.to_date && a.alto_hours) {
                    const absenceHours = parseFloat(a.alto_hours) || 0;
                    resultHours = Math.max(0, baseHours - absenceHours);
                } else {
                    // середина отсутствия — полностью отсутствует
                    resultHours = 0;
                }
                break;
            }
        }
    } else {
        // fallback: если нет индексированной структуры, используем старый путь
        const metadata = window.projectWorkloadMetadata || {};
        const userAbsences = metadata.user_absences || {};
        const userAbsenceList = userAbsences[email] || [];
        if (userAbsenceList && userAbsenceList.length) {
            for (const absence of userAbsenceList) {
                if (!absence.from_date || !absence.to_date) continue;
                if (dateStr >= absence.from_date && dateStr <= absence.to_date) {
                    if (dateStr === absence.from_date && absence.alfrom_hours) {
                        const absenceHours = parseFloat(absence.alfrom_hours) || 0;
                        resultHours = Math.max(0, baseHours - absenceHours);
                    } else if (dateStr === absence.to_date && absence.alto_hours) {
                        const absenceHours = parseFloat(absence.alto_hours) || 0;
                        resultHours = Math.max(0, baseHours - absenceHours);
                    } else {
                        resultHours = 0;
                    }
                    break;
                }
            }
        }
    }

    // сохраняем в локальный кэш
    window._pw_cache.availableHours[cacheKey] = resultHours;
    return resultHours;
}

/**
 * Расчет доступных часов за период (неделя/месяц)
 * Функция из референсного кода для правильного расчета процентов
 */
function calculateAvailableHoursForPeriod(data, period, userDailyHours, userAbsences, projectHolidays) {
    if (!data || !data.email || !period) return 0;

    // гарантируем, что кэш и индекс инициализированы (если нет, функция всё ещё работает)
    window._pw_cache = window._pw_cache || { availableHours: {} };

    // берём user daily hours map
    const userDailyMap = userDailyHours || {};
    const email = data.email;

    let totalAvailable = 0;
    let currentDate = frappe.datetime.str_to_obj(period.start_date);
    const endDate = frappe.datetime.str_to_obj(period.end_date);

    while (currentDate <= endDate) {
        const dateStr = frappe.datetime.obj_to_str(currentDate);

        // Проверка non-working: используем индексирование если есть
        const idx = window.projectWorkloadIndexed;
        let isNonWorking = false;
        if (idx) {
            // объединённое правило: project holidays (indexed) + user holidays (indexed)
            if (idx.projectHolidaySet && idx.projectHolidaySet.has(dateStr)) {
                isNonWorking = true;
            } else if (idx.userHolidayMap && idx.userHolidayMap[email] && idx.userHolidayMap[email].has(dateStr)) {
                isNonWorking = true;
            }
        } else {
            // fallback: use provided projectHolidays
            isNonWorking = isNonWorkingDay(dateStr, projectHolidays, email);
        }

        if (!isNonWorking) {
            // base hours — берём из userDailyMap если есть
            const baseHours = (userDailyMap[email] && userDailyMap[email][dateStr]) ? userDailyMap[email][dateStr] : 8;

            // getAvailableHoursOnDate использует индекс + кэш
            const availableOnDate = getAvailableHoursOnDate(data, dateStr, baseHours);
            totalAvailable += availableOnDate;
        }

        // next day
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return totalAvailable;
}

/**
 * Форматирование заголовка в зависимости от типа отображения
 */
function formatPeriodHeader(period) {
    if (!period) return "";
    
    if (currentViewType === 'daily') {
        const dateObj = frappe.datetime.str_to_obj(period.date);
        const dayNames = [__('Sun'), __('Mon'), __('Tue'), __('Wed'), __('Thu'), __('Fri'), __('Sat')];
        const dayMonth = frappe.datetime.str_to_user(period.date).split('-').slice(0, 2).join('.');
        const weekday = dayNames[dateObj.getDay()];
        return `${dayMonth}<br><small>${weekday}</small>`;
    }
    
    else if (currentViewType === 'weekly') {
        const startDate = frappe.datetime.str_to_obj(period.start_date);
        const endDate = frappe.datetime.str_to_obj(period.end_date);
        
        const formatDayMonth = (date) => {
            const day = date.getDate();
            const month = date.getMonth() + 1;
            return `${day}.${month}`;
        };
        
        const startStr = formatDayMonth(startDate);
        const endStr = formatDayMonth(endDate);
        
        // Только даты начала и конца недели (без W и номера)
        return `${startStr}<br><small>${endStr}</small>`;
    }
    
    else if (currentViewType === 'monthly') {
        const monthNames = [
            __('Jan'), __('Feb'), __('Mar'), __('Apr'), __('May'), __('Jun'),
            __('Jul'), __('Aug'), __('Sep'), __('Oct'), __('Nov'), __('Dec')
        ];
        return `${monthNames[period.month - 1]}<br><small>${period.year}</small>`;
    }
    
    return "";
}

let projectWorkloadDblClickHandler = null;
/**
 * Обработка двойного клика по строкам таблицы
 * - По пользователю - открывает отчет загрузки команды с фильтром
 * - По задаче/ячейке задачи - открывает диалог PWA
 */
function handleProjectWorkloadCellDoubleClick(rowData) {
    if (!rowData || !cur_frm) return;
    
    if (rowData.level === 'user' && rowData.email) {
        if (WL_DEBUG) console.log('User double-clicked:', rowData.email);
        
        sessionStorage.setItem('workload_report_filter_user', rowData.email);
        sessionStorage.setItem('workload_report_should_filter', 'true');
        frappe.set_route('Form', 'Projects Workload Report', 'Projects Workload Report');
        return;
    }
    
    if (rowData.level === 'task' && rowData.task_id) {
        if (WL_DEBUG) console.log('Task double-clicked:', rowData);
        
        const taskData = {
            name: rowData.task_id,
            value: rowData.task_id,
            project: cur_frm.doc.name,
            subject: rowData.task_subject,
            exp_start_date: rowData.exp_start_date,
            exp_end_date: rowData.exp_end_date
        };
        
        if (typeof start_pwa_dialog === 'function') {
            start_pwa_dialog((pwas) => {
                if (WL_DEBUG) console.log('PWA saved, refreshing data...');
                debouncedLoadProjectWorkloadData(cur_frm, true, true);
            }, taskData);
        } else {
            console.error('start_pwa_dialog function not found');
            frappe.msgprint(__('Функция открытия диалога PWA не найдена'));
        }
    }
}

function setupTaskDoubleClickHandler() {
    if (!cur_frm || !cur_frm.project_workload_dt) return;
    
    projectWorkloadDblClickHandler = handleProjectWorkloadCellDoubleClick;
    
    if (typeof cur_frm.project_workload_dt.setCellDoubleClickHandler === 'function') {
        cur_frm.project_workload_dt.setCellDoubleClickHandler(projectWorkloadDblClickHandler);
    }
}

/*
function indexMetadata(metadata) {
    if (!metadata) {
        window.projectWorkloadIndexed = null;
        return;
    }

    const indexed = {
        // project holidays that are real non-working (exclude weekly_off)
        projectHolidaySet: new Set((metadata.project_holidays || [])
            .filter(h => !h.weekly_off)
            .map(h => h.date)),

        // user-specific holidays (only non-weekly_off)
        userHolidayMap: {},

        // user absences as sorted intervals with ms timestamps for quick check
        userAbsenceMap: {}
    };

    // index user holidays
    const userHolidays = metadata.user_holidays || {};
    for (const email in userHolidays) {
        const arr = userHolidays[email] || [];
        indexed.userHolidayMap[email] = new Set(
            arr.filter(h => !h.weekly_off).map(h => h.date)
        );
    }

    // index user absences (convert dates to timestamps for fast numerical comparison)
    const userAbsences = metadata.user_absences || {};
    for (const email in userAbsences) {
        const arr = (userAbsences[email] || []).map(a => {
            return {
                from_date: a.from_date,
                to_date: a.to_date,
                from_ts: frappe.datetime.str_to_obj(a.from_date).getTime(),
                to_ts: frappe.datetime.str_to_obj(a.to_date).getTime(),
                alfrom_hours: a.alfrom_hours,
                alto_hours: a.alto_hours,
                type: a.type
            };
        }).sort((x,y) => x.from_ts - y.from_ts);

        indexed.userAbsenceMap[email] = arr;
    }

    window.projectWorkloadIndexed = indexed;
}
*/

function indexMetadata(metadata) {
    if (!metadata) {
        window.projectWorkloadIndexed = null;
        return;
    }

    const indexed = {
        // project holidays that are real non-working (exclude weekly_off)
        projectHolidaySet: new Set((metadata.project_holidays || [])
            .map(h => h.date)),

        // user-specific holidays (only non-weekly_off)
        userHolidayMap: {},

        // user absences as sorted intervals with ms timestamps for quick check
        userAbsenceMap: {}
    };

    // index user holidays
    const userHolidays = metadata.user_holidays || {};
    for (const email in userHolidays) {
        const arr = userHolidays[email] || [];
        indexed.userHolidayMap[email] = new Set(
            arr.map(h => h.date)
        );
    }

    // index user absences (convert dates to timestamps for fast numerical comparison)
    const userAbsences = metadata.user_absences || {};
    for (const email in userAbsences) {
        const arr = (userAbsences[email] || []).map(a => {
            return {
                from_date: a.from_date,
                to_date: a.to_date,
                from_ts: frappe.datetime.str_to_obj(a.from_date).getTime(),
                to_ts: frappe.datetime.str_to_obj(a.to_date).getTime(),
                alfrom_hours: a.alfrom_hours,
                alto_hours: a.alto_hours,
                type: a.type
            };
        }).sort((x,y) => x.from_ts - y.from_ts);

        indexed.userAbsenceMap[email] = arr;
    }

    window.projectWorkloadIndexed = indexed;
}



// ========== ОПТИМИЗИРОВАННЫЕ ФУНКЦИИ ФОРМАТИРОВАНИЯ ==========

/**
 * Получение данных через API с поддержкой типа отображения
 */
async function get_project_workload_data(frm, forceRefresh = false) {
    const timer = startTimer('get_project_workload_data');
    if (WL_DEBUG) console.log('=== START PROJECT WORKLOAD DATA LOADING ===');
    
    try {
        // Гарантируем, что даты инициализированы
        ensureDatesInitialized();
        
        // Формируем ключ кэша с учетом периода и типа отображения
        const cacheKey = `project_workload_${frm.doc.name}_${currentViewType}_${displayDateFrom}_${displayDateTo}_${getPwrLoadActualFlag()}`;
        
        const result = await getCachedData(cacheKey, async () => {
            return await frappe.call({
                method: 'get_project_workload_data',
                args: {
                    project: frm.doc.name,
                    view_type: currentViewType,  // daily, weekly, monthly
                    date_from: displayDateFrom,
                    date_to: displayDateTo,
                    load_actual: getPwrLoadActualFlag(),
                    worker_wtype: window.pwrWorkerWtype || ''
                },
                //freeze: true,
                freeze_message: __('Получение данных загрузки проекта...')
            });
        }, 5, forceRefresh);
        
        endTimer(timer);
        
        if (!result || !result.message) {
            throw new Error(__('Пустой ответ от сервера'));
        }
        
        if (result.message.error) {
            throw new Error(__('Ошибка сервера: {0}', [result.message.error]));
        }
        
        const { tree_data, periods, metadata, users_count, tasks_count, assignments_count } = result.message;
        
        if (WL_DEBUG) console.log('Project workload data loaded:', {
            tree_data_length: tree_data ? tree_data.length : 0,
            periods_length: periods ? periods.length : 0,
            view_type: currentViewType,
            users_count,
            tasks_count,
            assignments_count,
            display_period: metadata?.display_dates
        });

        // Сохраняем метаданные в глобальной переменной
        window.projectWorkloadMetadata = metadata || {};
        
        // индексируем метаданные для O(1) проверок
        if (metadata) {
            indexMetadata(metadata);
        } else {
            // очистка индекса если нет метаданных
            window.projectWorkloadIndexed = null;
        }
        
        // Сохраняем даты проекта
        if (metadata?.project_dates) {
            projectDates = metadata.project_dates;
        }
        
        return {
            tree_data: tree_data || [],
            periods: periods || []
        };
        
    } catch (error) {
        endTimer(timer);
        console.error('Error loading project workload data:', error);
        frappe.msgprint(__('Ошибка при загрузке данных: {0}', [error.message]));
        return {
            tree_data: [],
            periods: []
        };
    }
}

/**
 * Определение колонок таблицы с поддержкой трех уровней
 */
function get_project_workload_columns_definition(periods) {
    let columns = [];
    
    // ===== КОЛОНКА УЧАСТНИКА =====
    columns.push({
        name: __("Participant / Role / Task"),
        id: "participant",
        width: 250,
        sortable: true,
        editable: false,
        focusable: false,
        dropdown: false,
        treeView: true,
        format: (value, row, column, data) => {
            if (!data) {
                return `<div class="project-workload-cell pwr-participant-cell"></div>`;
            }
            
            if (data.level === 'user') {
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
                    data._cachedAvatarHtml = buildAvatar(fullName, userImage, 'project-user-avatar');
                }
                const avatarHtml = data._cachedAvatarHtml;
                
                return `<div class="project-workload-cell pwr-participant-cell">
                    <div class="project-user-display">
                        ${avatarHtml}
                        <div class="project-user-info">
                            <div class="project-user-fullname" title="${fullName}">${fullName}</div>
                            <div class="project-user-email" title="${email}">${email}</div>
                        </div>
                    </div>
                </div>`;
            }
            
            else if (data.level === 'role') {
                return `<div class="project-workload-cell pwr-participant-cell project-role-display">
                    <div class="project-role-name" title="${data.roleName || __('No Role')}">
                        ${data.roleName || __('No Role')}
                    </div>
                </div>`;
            }
            
            else if (data.level === 'task') {
                return `<div class="project-workload-cell pwr-participant-cell project-task-display">
                    <div class="project-task-name" title="${data.task_subject || __('Task')}">
                        ${data.task_subject || __('Task')}
                    </div>
                </div>`;
            }
            
            return `<div class="project-workload-cell pwr-participant-cell"></div>`;
        }
    });
    
    // ===== КОЛОНКИ С ДАННЫМИ =====
    periods.forEach(period => {
        const columnName = formatPeriodHeader(period);
        
        columns.push({
            name: columnName,
            id: period.key,
            width: getColumnWidthForViewType(),
            sortable: false,
            dropdown: false,
            editable: false,
            focusable: false,
            format: (value, row, column, data) => {
                if (!data) {
                    return `<div class="project-workload-cell"></div>`;
                }
                
                const metadata = window.projectWorkloadMetadata || {};
                const projectHolidays = metadata.project_holidays || [];
                const userHolidays = metadata.user_holidays || {};
                const userAbsences = metadata.user_absences || {};
                const userDailyHours = metadata.user_daily_hours || {};
                
                // ===== ОБЪЯВЛЯЕМ ВСЕ ПЕРЕМЕННЫЕ В НАЧАЛЕ =====
                let hours = parseFloat(value) || 0;
                let availableHours = 0;
                let percentage = 0;
                let tooltipDetails = [];
                
                // При проверке для пользователя используем ОБА списка:
                if (currentViewType === 'daily') {
                    // Для пользователя проверяем И project, И user holidays
                    let isNonWorking = false;
                    
                    if (data.level === 'user') {
                        // Для пользователя - объединяем оба списка
                        const allHolidays = [
                            ...projectHolidays,
                            ...(userHolidays[data.email] || [])
                        ];
                        isNonWorking = isNonWorkingDay(period.date, allHolidays, data.email);
                    } else {
                        // Для роли/задачи - только project holidays
                        isNonWorking = isNonWorkingDay(period.date, projectHolidays, data.email);
                    }
                    
                    if (isNonWorking) {
                        return `<div class="project-workload-cell project-weekend-cell"></div>`;
                    }
                    
                    const userAbsence = isUserAbsentOnDate(data.email, period.date, userAbsences);
                    if (userAbsence && userAbsence.isAbsent) {
                        if (userAbsence.isPartial) {
                            // Частичное отсутствие - НЕ меняем hours, они уже правильные с сервера
                            const baseHours = userDailyHours[data.email]?.[period.date] || 8;
                            const availableOnDate = getAvailableHoursOnDate(data, period.date, baseHours);
                            tooltipDetails.push(`${__("Partial absence")}: ${(baseHours - availableOnDate).toFixed(1)}h`);
                            // ИДЕМ ДАЛЬШЕ, НЕ МЕНЯЕМ hours
                        } else {
                            // Полное отсутствие
                            return `<div class="project-workload-cell project-absence-cell">
                                <div class="project-absence-text">${formatAbsenceText(userAbsence.type)}</div>
                            </div>`;
                        }
                    }
                    
                    // Расчет для daily
                    const baseHours = userDailyHours[data.email] ? 
                        userDailyHours[data.email][period.date] || 8 : 8;
                    availableHours = getAvailableHoursOnDate(data, period.date, baseHours);
                    
                    tooltipDetails.push(`${__("Base working hours")}: ${baseHours.toFixed(1)}h`);
                    
                    if (availableHours !== baseHours) {
                        const absenceHours = baseHours - availableHours;
                        tooltipDetails.push(`${__("Absence hours")}: ${absenceHours.toFixed(1)}h`);
                        tooltipDetails.push(`${__("Available hours")}: ${availableHours.toFixed(1)}h`);
                    }
                } else {
                    // Для weekly/monthly
                    availableHours = calculateAvailableHoursForPeriod(data, period, userDailyHours, userAbsences, projectHolidays);
                    tooltipDetails.push(`${__("Period available hours")}: ${availableHours.toFixed(1)}h`);
                }
                
                // Расчет процента
                if (availableHours > 0) {
                    percentage = Math.round((hours / availableHours) * 100);
                }
                
                tooltipDetails.push(`${__("Workload")}: ${hours.toFixed(1)}h (${percentage}%)`);
                const tooltip = tooltipDetails.join('\n');

                const levelClass = `level-${data.level || 'unknown'}`;

                if (isPwrShowFactEnabled()) {
                    const periodKey = (column && column.id) || period.key;
                    const actualHours = parseFloat(data[`${periodKey}_actual`]) || 0;
                    const planFactHtml = renderPwrPlanFactCell({
                        planHours: hours,
                        actualHours,
                        availableHours,
                        tooltip,
                        cellClass: `project-workload-cell ${levelClass}`,
                        visualPrefix: "project-workload",
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
                        cellClass: `project-workload-cell ${levelClass}`,
                        visualPrefix: "project-workload",
                    });
                }
            }
        });
    });
    
    return columns;
}

/**
 * Получение ширины колонки в зависимости от типа отображения
 */
function getColumnWidthForViewType() {
    switch(currentViewType) {
        case 'daily':
            return 50; // Узкие колонки для дней
        case 'weekly':
            return 70; // Пошире для недель
        case 'monthly':
            return 80; // Еще шире для месяцев
        default:
            return 55;
    }
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

function normalizeProjectWorkloadFiltersRow(frm) {
    if (!frm || !frm.fields_dict.custom_workload) {
        return;
    }
    const $wrapper = frm.fields_dict.custom_workload.$wrapper;
    if (!$wrapper || !$wrapper.length) {
        return;
    }
    const $row = $wrapper.find('.unified-filters-row').first();
    if (!$row.length) {
        return;
    }
    $row.find('.help-box, .clearfix, .control-label').hide();
    $row.find('.frappe-control').each(function () {
        compactPwrFilterControl($(this));
    });
}

/**
 * Создание выпадающего списка типа отображения (дни/недели/месяцы)
 */
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
                    window.projectWorkloadViewType = currentViewType;
                    resetProjectWorkloadPeriodAnchor();
                    if (WL_DEBUG) console.log(`View type changed to: ${currentViewType}`);
                    if (cur_frm) {
                        debouncedLoadProjectWorkloadData(cur_frm, true, true);
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
 * НОВОЕ: Создание выпадающего списка периода отображения (квартал/полгода/год)
 * Скопировано из референсного отчета
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
                    if (WL_DEBUG) console.log(`Period range changed to: ${currentPeriodRange}`);
                    resetProjectWorkloadPeriodAnchor();
                    if (cur_frm) {
                        debouncedLoadProjectWorkloadData(cur_frm, true, true);
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

function applyProjectWorkloadSectionLayout(frm) {
    if (!frm || !frm.fields_dict.custom_workload) return;

    const zeroBox = { padding: 0, margin: 0, width: '100%', maxWidth: '100%', boxSizing: 'border-box' };
    const wrapper = frm.fields_dict.custom_workload;
    const $wrapper = wrapper.$wrapper;
    if (!$wrapper || !$wrapper.length) return;

    $wrapper.css({ ...zeroBox, display: 'flex', flexDirection: 'column', maxWidth: '100%' });

    const $tabPane = $wrapper.closest('#project-custom_загрузка, .tab-pane[data-fieldname="custom_загрузка"]');
    if ($tabPane.length) {
        $tabPane.css({ ...zeroBox, paddingLeft: 0, paddingRight: 0 });
        $tabPane.find('.form-section.card-section, .form-section').css({
            padding: 0,
            margin: 0,
            border: 'none',
            boxShadow: 'none',
            background: 'transparent',
            width: '100%',
            maxWidth: '100%',
        });
        $tabPane.find('.section-body, .form-column, [class*="col-sm-"]').css(zeroBox);
    }

    const $field = $wrapper.closest('[data-fieldname="custom_workload"]');
    if ($field.length) {
        $field.css(zeroBox);
        $field.find('.control-label').hide();
        $field.find('.frappe-control, .control-input-wrapper, .control-input, .form-group').css(zeroBox);
    }

    const $section = $wrapper.closest('.form-section');
    if ($section.length) {
        $section.css({
            padding: 0,
            margin: 0,
            border: 'none',
            boxShadow: 'none',
            background: 'transparent',
            width: '100%',
            maxWidth: '100%',
        });
        $section.find('.section-head').hide();
        $section.find('.section-body').css(zeroBox);
        $section.find('.form-column, [class*="col-sm-"]').css(zeroBox);
    }

    $wrapper.find('.projects-workload-controls.unified-filters-row, .unified-filters-row').css({
        paddingTop: 8,
        paddingBottom: 0,
        paddingLeft: 8,
        paddingRight: 8,
        margin: 0,
        border: 'none',
        background: 'transparent',
    });

    normalizeProjectWorkloadFiltersRow(frm);

    $wrapper.find('.project-workload-table, .project-workload-ag-grid').css({
        ...zeroBox,
        marginTop: 0,
    });
}

// ========== УЛУЧШЕННЫЕ ФУНКЦИИ ДЛЯ ФИЛЬТРОВ ==========

/**
 * Создание строки фильтров с датами и выбором отображения
 */
function createProjectFilterRow(frm, $wrapper) {
    let controls, $flow, buttonsContainer;
    if (pwrShared().createPwrFilterRowShell) {
        ({ controls, $flow, buttonsContainer } = pwrShared().createPwrFilterRowShell($wrapper, {
            extraRowClass: 'pt-1 pb-1',
        }));
    } else {
        controls = $('<div class="projects-workload-controls unified-filters-row d-flex flex-nowrap align-items-start w-100 pt-1 pb-1"></div>').appendTo($wrapper);
        $flow = $('<div class="pwr-filters-flow d-flex flex-wrap align-items-center"></div>').appendTo(controls);
        buttonsContainer = $('<div class="pwr-filters-group pwr-filters-group--right filter-buttons d-flex flex-shrink-0 align-items-center justify-content-end"></div>').appendTo(controls);
    }

    createPwrWorkerTypeFilter($flow);
    createPwrShowFactFilter($flow);

    ensureDatesInitialized();

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
        if (WL_DEBUG) console.log('Manual refresh triggered');
        
        // Очищаем кэш
        projectWorkloadCache = {
            globalCache: {}
        };
        
        // Сбрасываем метаданные
        window.projectWorkloadMetadata = {};
        
        // также очищаем индекс
        window.projectWorkloadIndexed = null;
        
        // Загружаем данные с принудительным обновлением
        debouncedLoadProjectWorkloadData(frm, true, true);
    });
    
    return controls;
}

// ========== ОСНОВНЫЕ ФУНКЦИИ ЗАГРУЗКИ ==========

/**
 * Загрузка данных таблицы
 */
async function load_project_workload_data(frm, forceRefresh = false) {
    if (WL_DEBUG) console.log('>>> load_project_workload_data STARTED (3-level)', {
        isProjectWorkloadLoading,
        forceRefresh,
        hasDT: !!frm.project_workload_dt
    });
    
    if (isProjectWorkloadLoading) {
        if (WL_DEBUG) console.log('Project workload data is already loading, skipping duplicate call');
        return;
    }
    
    const timer = startTimer('load_project_workload_data');
    let wrapper = frm.get_field("custom_workload");
    let $wrapper = wrapper?.$wrapper;
    
    window._pw_cache = { availableHours: {} };
    
    try {
        isProjectWorkloadLoading = true;
        if (WL_DEBUG) console.log('START loading project workload data with view type:', currentViewType);
        
        ensureDatesInitialized();
        syncPwrProjectGlobals();
        
        if (WL_DEBUG) console.log(`Loading data for period: ${displayDateFrom} to ${displayDateTo}`);
        
        
        if (frm.project_workload_dt) {
            frm.project_workload_dt.freeze();
        }
        
        const result = await get_project_workload_data(frm, forceRefresh);
        const table_data = result.tree_data;
        const server_periods = result.periods;
        
        projectWorkloadTableData = table_data;
        frm.project_workload_periods = server_periods || [];

        if (frm.project_workload_dt) {
            const periods = server_periods;
            if (WL_DEBUG) console.log(`Using ${periods.length} periods for ${currentViewType} view`);
            if (WL_DEBUG) console.log(`Table data has ${table_data.length} rows with levels:`, 
                table_data.map(r => ({level: r.level, name: r.participant})).slice(0, 10));
            
            const columns = get_project_workload_columns_definition(periods);
            
             $wrapper?.addClass("animate");
            frm.project_workload_dt.refresh(table_data, columns, {
                workloadPeriods: periods,
                workloadViewType: currentViewType,
                rowHeight: getPwrRowHeight(),
                showFact: isPwrShowFactEnabled(),
            });
            
            // Сворачиваем все узлы (показываем только пользователей)
            if (frm.project_workload_dt.rowmanager) {
                frm.project_workload_dt.rowmanager.collapseAllNodes();
            }
            
            frm.project_workload_dt.unfreeze();
            
            setupTaskDoubleClickHandler();
            requestProjectWorkloadChartReload(frm);
        }
    } catch (error) {
        console.error('Error loading project workload data:', error);
        if (frm.project_workload_dt) {
            frm.project_workload_dt.unfreeze();
        }
    } finally {
        isProjectWorkloadLoading = false;
        endTimer(timer);
        if (WL_DEBUG) console.log('END loading project workload data');
        
        let active_tab = frm.get_active_tab();
        let fieldname = active_tab?.df.fieldname;
        
        if (fieldname === 'custom_загрузка') {
            setTimeout(() => {
                $wrapper?.removeClass("animate")},
                1000 );
        }
    }
}

let projectTabChangeHandler = null;
/**
 * Отрисовка таблицы загрузки проекта
 */
async function render_project_workload_table(frm) {
    if (WL_DEBUG) console.log('render_project_workload_table CALLED');
    if (WL_DEBUG) console.log('Table initialized flag:', frm.project_workload_table_initialized);
    
    const timer = startTimer('render_project_workload_table');
    let wrapper = frm.get_field("custom_workload");
    if (!wrapper) {
        if (WL_DEBUG) console.log('Wrapper not found!');
        endTimer(timer);
        return;
    }
    
    let $wrapper = wrapper.$wrapper;
    if (!$wrapper || !$wrapper.length) {
        if (WL_DEBUG) console.log('$wrapper not found or empty!');
        endTimer(timer);
        return;
    }
    
    $wrapper.addClass("project_workload_container d-flex flex-column");
    
    // Если таблица уже инициализирована - не создаем заново
    if (frm.project_workload_table_initialized) {
        applyProjectWorkloadSectionLayout(frm);
        requestProjectWorkloadChartReload(frm);
        if (WL_DEBUG) console.log('Table already initialized - skipping creation');
        endTimer(timer);
        return;
    }
    
    if (WL_DEBUG) console.log('CREATING NEW TABLE...');
    
    try {
        await ensureProjectWorkloadAgGrid();
    } catch (error) {
        console.error('Error loading ProjectsWorkloadAgGrid:', error);
        frappe.msgprint(__('Не удалось загрузить компонент таблицы: {0}', [error.message]));
        endTimer(timer);
        return;
    }
    
    // Очищаем контейнер
    $wrapper.empty();
    
    // Создаем строку фильтров
    let controls = createProjectFilterRow(frm, $wrapper);
    
    // Контейнер для таблицы
    let table_container = $('<div class="project-workload-table"></div>').appendTo($wrapper);

    // Инициализация таблицы
    if (WL_DEBUG) console.log('Initializing ProjectsWorkloadAgGrid...');

    frm.project_workload_dt = new ProjectsWorkloadAgGrid.Table(table_container[0], {
        columns: [],
        data: [],
        rowHeight: getPwrRowHeight(),
        headerHeight: 70,
        participantWidth: 250,
        indentSize: 18,
        extraClass: "project-workload-ag-grid",
        freezeMessage: __("Идет загрузка данных..."),
        isRowExpandable: function(row) {
            if (!row || row.expandable !== true) {
                return false;
            }
            return this.rowHasTreeChildren(row);
        },
        onCellDoubleClick: handleProjectWorkloadCellDoubleClick
    });
    
    if (WL_DEBUG) console.log('ProjectsWorkloadAgGrid created');

    applyProjectWorkloadSectionLayout(frm);
    setTimeout(() => applyProjectWorkloadSectionLayout(frm), 0);

    // Обновляем значения в контролах дат
    ensureDatesInitialized();
    updateDateControls();
    
    // Загружаем данные и ТОЛЬКО ПОСЛЕ УСПЕХА устанавливаем флаг
    if (WL_DEBUG) console.log('Loading initial data...');
    load_project_workload_data(frm, false).then(() => {
        lastLoadedProject = frm.doc.name;
        lastLoadedTime = new Date();
        
        // Устанавливаем флаг ТОЛЬКО после успешной загрузки
        frm.project_workload_table_initialized = true;
        if (WL_DEBUG) console.log('Table initialized flag set to TRUE after successful load');
        requestProjectWorkloadChartReload(frm);
        
        endTimer(timer);
        if (WL_DEBUG) console.log('Initial data loaded successfully');
    }).catch((error) => {
        console.error('Initial data load failed:', error);
        // При ошибке НЕ устанавливаем флаг, чтобы можно было повторить попытку
        endTimer(timer);
    });
    
    if ( projectTabChangeHandler ) {
        $('.nav-link[data-toggle="tab"]').off('shown.bs.tab', projectTabChangeHandler );
        projectTabChangeHandler = null;
    }
    
    projectTabChangeHandler = function (e) {
        let tab_fieldname = $(e.target).attr("data-fieldname");
        if (WL_DEBUG) console.log('Переключено на вкладку:', tab_fieldname);  // Для отладки
        
        if (tab_fieldname === 'custom_загрузка') {
            applyProjectWorkloadSectionLayout(frm);
            requestProjectWorkloadChartReload(frm);
            setTimeout(() => {
                $wrapper?.removeClass("animate")},
                1000 );
        } else {
            setTimeout(() => {
                $wrapper?.addClass("animate")},
                1000 );
        }
    };
    
    $('.nav-link[data-toggle="tab"]').on('shown.bs.tab', projectTabChangeHandler );
}

// ========== КЛИЕНТСКИЙ СКРИПТ ==========

frappe.ui.form.on("Project", {    
    onload: function(frm) {
        if (WL_DEBUG) console.log("Project Workload: onload");
        
        // Сброс всех переменных
        projectWorkloadCache = { globalCache: {} };
        projectWorkloadTableData = [];
        window.projectWorkloadMetadata = {};
        isRedrawingGantt = false;
        isProjectWorkloadLoading = false;
        currentViewType = 'daily';
        window.currentViewType = currentViewType;
        window.projectWorkloadViewType = currentViewType;
        displayDateFrom = null;
        displayDateTo = null;
        syncPwrProjectGlobals();
        projectDates = null;
        
        // Сбрасываем ссылки на контролы
        dateFromControl = null;
        dateToControl = null;
        
        // ВАЖНО: СБРАСЫВАЕМ ФЛАГ ТАБЛИЦЫ
        frm.project_workload_table_initialized = false;
        // Также удаляем свойство dt, если оно есть
        if (frm.project_workload_dt) {
            frm.project_workload_dt = null;
        }
        
        if (WL_DEBUG) console.log("Dates will be initialized when needed, table flag reset to false");
        
        // Применяем стили
        if (typeof applyProjectWorkloadStyle === 'function') {
            applyProjectWorkloadStyle();
        }
    },
    
    refresh: function(frm) {
        if (WL_DEBUG) console.log("Project Workload: refresh");
        // При обновлении страницы тоже сбрасываем
        frm.project_workload_table_initialized = false;
        if (frm.project_workload_dt) {
            frm.project_workload_dt = null;
        }
        render_project_workload_table(frm);
    },
    
    before_save: function(frm) {
        // Сохраняем текущие даты в документе для восстановления при перезагрузке
        if (displayDateFrom && displayDateTo) {
            frm.doc.custom_workload_date_from = displayDateFrom;
            frm.doc.custom_workload_date_to = displayDateTo;
        }
    }
});

window.debouncedLoadProjectWorkloadData = debouncedLoadProjectWorkloadData;

$(document).on("pwr-workload-data-reload", function (_event, frm, meta) {
    if (!frm || frm.doctype !== "Project") {
        return;
    }
    if (meta && typeof meta.showFact === "boolean") {
        window.pwrShowFact = meta.showFact;
    }
    if (meta && meta.periodAnchor && typeof displayDateFrom !== "undefined") {
        displayDateFrom = meta.periodAnchor;
        window.displayDateFrom = displayDateFrom;
    }
    if (meta && meta.periodAnchorTo && typeof displayDateTo !== "undefined") {
        displayDateTo = meta.periodAnchorTo;
        window.displayDateTo = displayDateTo;
    }
    syncPwrProjectGlobals();
    updateDateControls();
    if (frm._pwrUpdatePeriodNavLabel) {
        frm._pwrUpdatePeriodNavLabel();
    }
    debouncedLoadProjectWorkloadData(frm, true, true);
});
