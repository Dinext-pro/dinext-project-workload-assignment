/* ISS-2026-00002 Phase 3b: Project Workload tab — state, dates, metadata helpers. */
frappe.provide("project_workload_assignment.pwrProject");

(function () {
	const NS = project_workload_assignment.pwrProject;
	var WL_DEBUG = typeof window.WL_DEBUG !== "undefined" ? window.WL_DEBUG : false;

	function pwrShared() {
		return project_workload_assignment.pwrShared || {};
	}

	NS.state = {
		isLoading: false,
		loadTimeout: null,
		cache: { globalCache: {} },
		tableData: [],
		currentViewType: "daily",
		currentPeriodRange: "quarter",
		displayDateFrom: null,
		displayDateTo: null,
		projectDates: null,
		dateFromControl: null,
		dateToControl: null,
		dblClickHandler: null,
		tabChangeHandler: null,
	};

	const performanceLog = {};

	function syncGlobals() {
		const s = NS.state;
		window.currentViewType = s.currentViewType;
		window.projectWorkloadViewType = s.currentViewType;
		window.currentPeriodRange = s.currentPeriodRange;
		window.displayDateFrom = s.displayDateFrom;
		window.displayDateTo = s.displayDateTo;
	}

	window.currentViewType = NS.state.currentViewType;
	window.projectWorkloadViewType = NS.state.currentViewType;
	window.currentPeriodRange = NS.state.currentPeriodRange;
	window.pwrShowFact = !!window.pwrShowFact;
	window.projectWorkloadMetadata = window.projectWorkloadMetadata || {};
	syncGlobals();

	function isPwrShowFactEnabled() {
		const fn = pwrShared().isPwrShowFactEnabled;
		return fn ? fn(window.cur_frm) : !!window.pwrShowFact;
	}

	function getPwrLoadActualFlag(options) {
		const fn = pwrShared().getPwrLoadActualFlag;
		return fn ? fn(options) : isPwrShowFactEnabled() ? 1 : 0;
	}

	function renderPwrPlanFactCell(options) {
		const fn = pwrShared().renderPwrPlanFactCell;
		return fn ? fn(options) : null;
	}

	function getPwrRowHeight() {
		const fn = pwrShared().getPwrRowHeight;
		return fn ? fn() : isPwrShowFactEnabled() ? 54 : 40;
	}

	function getPwrPeriodAnchorLabel(frm) {
		const fn = pwrShared().getPwrPeriodAnchorLabel;
		if (!fn) {
			return "";
		}
		return fn(frm || window.cur_frm, () => {
			NS.ensureDatesInitialized();
			const s = NS.state;
			return `${frappe.datetime.str_to_user(s.displayDateFrom)} — ${frappe.datetime.str_to_user(s.displayDateTo)}`;
		});
	}

	function triggerPwrWorkloadDataReload(frm) {
		syncGlobals();
		const fn = pwrShared().triggerPwrWorkloadDataReload;
		if (fn) {
			fn(frm || window.cur_frm, {
				showFact: isPwrShowFactEnabled(),
				periodAnchor: NS.state.displayDateFrom,
			});
		}
	}

	function requestProjectWorkloadChartReload(frm) {
		if (!frm || frm.doctype !== "Project") {
			return;
		}
		syncGlobals();
		$(document).trigger("pwr-workload-chart-reload", [frm]);
	}

	function ensureProjectWorkloadAgGrid() {
		const shared = pwrShared();
		if (shared.ensureAgGrid) {
			return shared.ensureAgGrid();
		}
		if (
			window.ProjectsWorkloadAgGrid &&
			typeof window.ProjectsWorkloadAgGrid.ensure === "function"
		) {
			return Promise.resolve(window.ProjectsWorkloadAgGrid.ensure());
		}
		return new Promise((resolve, reject) => {
			frappe.require(["/assets/project_workload_assignment/js/charts/ag-grid.js"], () => {
				if (
					window.ProjectsWorkloadAgGrid &&
					typeof window.ProjectsWorkloadAgGrid.ensure === "function"
				) {
					resolve(window.ProjectsWorkloadAgGrid.ensure());
					return;
				}
				reject(new Error("ProjectsWorkloadAgGrid не загрузился"));
			});
		});
	}

	function startTimer(name) {
		const uniqueName = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
		performanceLog[uniqueName] = {
			start: performance.now(),
			end: null,
			duration: null,
			originalName: name,
		};
		return uniqueName;
	}

	function endTimer(uniqueName) {
		if (!performanceLog[uniqueName]) {
			return;
		}
		performanceLog[uniqueName].end = performance.now();
		performanceLog[uniqueName].duration =
			performanceLog[uniqueName].end - performanceLog[uniqueName].start;
		if (WL_DEBUG) {
			console.log(
				`⏱️ ${performanceLog[uniqueName].originalName}: ${performanceLog[uniqueName].duration.toFixed(2)}ms`
			);
		}
	}

	function getCachedData(cacheKey, fetchFunction, ttlMinutes, noCache) {
		const ttl = ttlMinutes == null ? 10 : ttlMinutes;
		const now = Date.now();
		const cache = NS.state.cache;

		if (!cache.globalCache) {
			cache.globalCache = {};
		}

		if (noCache) {
			if (WL_DEBUG) {
				console.log(`🔄 Cache SKIP (force refresh): ${cacheKey}`);
			}
			return fetchFunction().then((result) => {
				cache.globalCache[cacheKey] = { data: result, timestamp: now };
				return result;
			});
		}

		const cached = cache.globalCache[cacheKey];
		if (cached && now - cached.timestamp < ttl * 60 * 1000) {
			if (WL_DEBUG) {
				console.log(`🔄 Cache HIT: ${cacheKey}`);
			}
			return Promise.resolve(cached.data);
		}

		if (WL_DEBUG) {
			console.log(`🔄 Cache MISS: ${cacheKey}`);
		}

		return fetchFunction().then((result) => {
			cache.globalCache[cacheKey] = { data: result, timestamp: now };
			return result;
		});
	}

	function getCurrentDateYYYYMMDD() {
		return frappe.datetime.get_today();
	}

	function getDefaultDateFrom() {
		return getCurrentDateYYYYMMDD();
	}

	function getDefaultDateTo() {
		const today = getCurrentDateYYYYMMDD();
		let periodDate;

		switch (NS.state.currentPeriodRange) {
			case "half_year":
				periodDate = frappe.datetime.add_months(today, 6);
				break;
			case "year":
				periodDate = frappe.datetime.add_months(today, 12);
				break;
			case "quarter":
			default:
				periodDate = frappe.datetime.add_months(today, 3);
				break;
		}

		if (WL_DEBUG) {
			console.log(`Period date from ${NS.state.currentPeriodRange}:`, periodDate);
		}

		if (NS.state.projectDates && NS.state.projectDates.end_date) {
			if (WL_DEBUG) {
				console.log("Project end date:", NS.state.projectDates.end_date);
			}
			return NS.state.projectDates.end_date < periodDate
				? NS.state.projectDates.end_date
				: periodDate;
		}

		if (WL_DEBUG) {
			console.log("No project end date, using period date");
		}
		return periodDate;
	}

	function validateDates(dateFrom, dateTo) {
		const from = frappe.datetime.str_to_obj(dateFrom);
		const to = frappe.datetime.str_to_obj(dateTo);

		if (from > to) {
			frappe.show_alert(__('The "From" date cannot be later than the "To" date'), 5);
			return false;
		}

		const maxDate = new Date(from);
		maxDate.setFullYear(maxDate.getFullYear() + 1);

		if (to > maxDate) {
			frappe.show_alert(__("Maximum display period is 1 year"), 5);
			return false;
		}

		return true;
	}

	function ensureDatesInitialized() {
		const s = NS.state;
		if (!s.displayDateFrom || !s.displayDateTo) {
			if (WL_DEBUG) {
				console.log("Initializing dates from current date forward...");
			}
			s.displayDateFrom = getDefaultDateFrom();
			s.displayDateTo = getDefaultDateTo();
			syncGlobals();
			if (WL_DEBUG) {
				console.log("Dates initialized:", {
					from: s.displayDateFrom,
					to: s.displayDateTo,
					source: s.projectDates?.end_date ? "project end date" : "default quarter",
				});
			}
		}
	}

	function updateDateControls() {
		const s = NS.state;
		if (s.dateFromControl && s.displayDateFrom) {
			if (WL_DEBUG) {
				console.log("Updating dateFrom control with:", s.displayDateFrom);
			}
			s.dateFromControl.set_value(s.displayDateFrom);
		}
		if (s.dateToControl && s.displayDateTo) {
			if (WL_DEBUG) {
				console.log("Updating dateTo control with:", s.displayDateTo);
			}
			s.dateToControl.set_value(s.displayDateTo);
		}
	}

	function resetProjectWorkloadPeriodAnchor() {
		NS.state.displayDateFrom = getDefaultDateFrom();
		NS.state.displayDateTo = null;
		ensureDatesInitialized();
		syncGlobals();
		updateDateControls();
	}

	function shiftProjectWorkloadPeriod(direction) {
		ensureDatesInitialized();
		const s = NS.state;
		s.displayDateFrom = frappe.datetime.add_months(s.displayDateFrom, direction);
		s.displayDateTo = frappe.datetime.add_months(s.displayDateTo, direction);
		syncGlobals();
		updateDateControls();
		triggerPwrWorkloadDataReload(window.cur_frm);
	}

	function isNonWorkingDay(dateStr, holidays, userEmail) {
		const idx = window.projectWorkloadIndexed;
		if (idx) {
			if (idx.projectHolidaySet && idx.projectHolidaySet.has(dateStr)) {
				return true;
			}
			if (userEmail && idx.userHolidayMap && idx.userHolidayMap[userEmail]) {
				if (idx.userHolidayMap[userEmail].has(dateStr)) {
					return true;
				}
			}
			return false;
		}

		if (!dateStr || !holidays || holidays.length === 0) {
			return false;
		}

		for (let i = 0; i < holidays.length; i++) {
			const holiday = holidays[i];
			if (holiday.date === dateStr) {
				if (holiday.weekly_off) {
					return false;
				}
				return true;
			}
		}

		return false;
	}

	function isUserAbsentOnDate(userEmail, date, userAbsences) {
		if (!userAbsences || !userAbsences[userEmail]) {
			return null;
		}

		const userAbsenceList = userAbsences[userEmail];
		const targetDate = date;
		const metadata = window.projectWorkloadMetadata || {};
		const userDailyHours = metadata.user_daily_hours || {};
		const userBaseHours = userDailyHours[userEmail]?.[targetDate] || 8;

		for (const absence of userAbsenceList) {
			if (!absence.from_date || !absence.to_date) {
				continue;
			}

			if (targetDate >= absence.from_date && targetDate <= absence.to_date) {
				const fromHours = parseFloat(absence.alfrom_hours) || 0;
				const toHours = parseFloat(absence.alto_hours) || 0;
				const isPartial =
					(targetDate === absence.from_date &&
						fromHours > 0 &&
						fromHours < userBaseHours) ||
					(targetDate === absence.to_date && toHours > 0 && toHours < userBaseHours);

				return {
					isAbsent: true,
					isPartial: isPartial,
					type: absence.type || __("Absence"),
					alfrom_hours: absence.alfrom_hours,
					alto_hours: absence.alto_hours,
				};
			}
		}

		return null;
	}

	function formatAbsenceText(_absenceType) {
		return __("Abs.");
	}

	function getAvailableHoursOnDate(data, dateStr, baseHours) {
		if (!data || !data.email) {
			return baseHours;
		}

		const email = data.email;
		const idx = window.projectWorkloadIndexed;
		window._pw_cache = window._pw_cache || { availableHours: {} };
		const cacheKey = `${email}_${dateStr}`;
		if (Object.prototype.hasOwnProperty.call(window._pw_cache.availableHours, cacheKey)) {
			return window._pw_cache.availableHours[cacheKey];
		}

		let resultHours = baseHours;

		if (idx && idx.userAbsenceMap && Array.isArray(idx.userAbsenceMap[email])) {
			const dateTs = frappe.datetime.str_to_obj(dateStr).getTime();
			const intervals = idx.userAbsenceMap[email];

			for (let i = 0; i < intervals.length; i++) {
				const a = intervals[i];
				if (dateTs < a.from_ts) {
					break;
				}
				if (dateTs >= a.from_ts && dateTs <= a.to_ts) {
					if (dateStr === a.from_date && a.alfrom_hours) {
						const absenceHours = parseFloat(a.alfrom_hours) || 0;
						resultHours = Math.max(0, baseHours - absenceHours);
					} else if (dateStr === a.to_date && a.alto_hours) {
						const absenceHours = parseFloat(a.alto_hours) || 0;
						resultHours = Math.max(0, baseHours - absenceHours);
					} else {
						resultHours = 0;
					}
					break;
				}
			}
		} else {
			const metadata = window.projectWorkloadMetadata || {};
			const userAbsences = metadata.user_absences || {};
			const userAbsenceList = userAbsences[email] || [];
			if (userAbsenceList && userAbsenceList.length) {
				for (const absence of userAbsenceList) {
					if (!absence.from_date || !absence.to_date) {
						continue;
					}
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

		window._pw_cache.availableHours[cacheKey] = resultHours;
		return resultHours;
	}

	function calculateAvailableHoursForPeriod(
		data,
		period,
		userDailyHours,
		userAbsences,
		projectHolidays
	) {
		if (!data || !data.email || !period) {
			return 0;
		}

		window._pw_cache = window._pw_cache || { availableHours: {} };
		const userDailyMap = userDailyHours || {};
		const email = data.email;
		let totalAvailable = 0;
		let currentDate = frappe.datetime.str_to_obj(period.start_date);
		const endDate = frappe.datetime.str_to_obj(period.end_date);

		while (currentDate <= endDate) {
			const dateStr = frappe.datetime.obj_to_str(currentDate);
			const idx = window.projectWorkloadIndexed;
			let isNonWorking = false;

			if (idx) {
				if (idx.projectHolidaySet && idx.projectHolidaySet.has(dateStr)) {
					isNonWorking = true;
				} else if (
					idx.userHolidayMap &&
					idx.userHolidayMap[email] &&
					idx.userHolidayMap[email].has(dateStr)
				) {
					isNonWorking = true;
				}
			} else {
				isNonWorking = isNonWorkingDay(dateStr, projectHolidays, email);
			}

			if (!isNonWorking) {
				const baseHours =
					userDailyMap[email] && userDailyMap[email][dateStr]
						? userDailyMap[email][dateStr]
						: 8;
				totalAvailable += getAvailableHoursOnDate(data, dateStr, baseHours);
			}

			currentDate.setDate(currentDate.getDate() + 1);
		}

		return totalAvailable;
	}

	function formatPeriodHeader(period) {
		if (!period) {
			return "";
		}

		const viewType = NS.state.currentViewType;

		if (viewType === "daily") {
			const dateObj = frappe.datetime.str_to_obj(period.date);
			const dayNames = [
				__("Sun"),
				__("Mon"),
				__("Tue"),
				__("Wed"),
				__("Thu"),
				__("Fri"),
				__("Sat"),
			];
			const dayMonth = frappe.datetime.str_to_user(period.date).split("-").slice(0, 2).join(".");
			const weekday = dayNames[dateObj.getDay()];
			return `${dayMonth}<br><small>${weekday}</small>`;
		}

		if (viewType === "weekly") {
			const startDate = frappe.datetime.str_to_obj(period.start_date);
			const endDate = frappe.datetime.str_to_obj(period.end_date);
			const formatDayMonth = (date) => `${date.getDate()}.${date.getMonth() + 1}`;
			return `${formatDayMonth(startDate)}<br><small>${formatDayMonth(endDate)}</small>`;
		}

		if (viewType === "monthly") {
			const monthNames = [
				__("Jan"),
				__("Feb"),
				__("Mar"),
				__("Apr"),
				__("May"),
				__("Jun"),
				__("Jul"),
				__("Aug"),
				__("Sep"),
				__("Oct"),
				__("Nov"),
				__("Dec"),
			];
			return `${monthNames[period.month - 1]}<br><small>${period.year}</small>`;
		}

		return "";
	}

	function indexMetadata(metadata) {
		if (!metadata) {
			window.projectWorkloadIndexed = null;
			return;
		}

		const indexed = {
			projectHolidaySet: new Set((metadata.project_holidays || []).map((h) => h.date)),
			userHolidayMap: {},
			userAbsenceMap: {},
		};

		const userHolidays = metadata.user_holidays || {};
		for (const email in userHolidays) {
			const arr = userHolidays[email] || [];
			indexed.userHolidayMap[email] = new Set(arr.map((h) => h.date));
		}

		const userAbsences = metadata.user_absences || {};
		for (const email in userAbsences) {
			const arr = (userAbsences[email] || [])
				.map((a) => ({
					from_date: a.from_date,
					to_date: a.to_date,
					from_ts: frappe.datetime.str_to_obj(a.from_date).getTime(),
					to_ts: frappe.datetime.str_to_obj(a.to_date).getTime(),
					alfrom_hours: a.alfrom_hours,
					alto_hours: a.alto_hours,
					type: a.type,
				}))
				.sort((x, y) => x.from_ts - y.from_ts);
			indexed.userAbsenceMap[email] = arr;
		}

		window.projectWorkloadIndexed = indexed;
	}

	function resetStateOnLoad() {
		NS.state.cache = { globalCache: {} };
		NS.state.tableData = [];
		window.projectWorkloadMetadata = {};
		NS.state.isLoading = false;
		NS.state.currentViewType = "daily";
		NS.state.displayDateFrom = null;
		NS.state.displayDateTo = null;
		NS.state.projectDates = null;
		NS.state.dateFromControl = null;
		NS.state.dateToControl = null;
		syncGlobals();
	}

	Object.assign(NS, {
		WL_DEBUG,
		pwrShared,
		syncGlobals,
		isPwrShowFactEnabled,
		getPwrLoadActualFlag,
		renderPwrPlanFactCell,
		getPwrRowHeight,
		getPwrPeriodAnchorLabel,
		triggerPwrWorkloadDataReload,
		requestProjectWorkloadChartReload,
		ensureProjectWorkloadAgGrid,
		startTimer,
		endTimer,
		getCachedData,
		getCurrentDateYYYYMMDD,
		getDefaultDateFrom,
		getDefaultDateTo,
		validateDates,
		ensureDatesInitialized,
		updateDateControls,
		resetProjectWorkloadPeriodAnchor,
		shiftProjectWorkloadPeriod,
		isNonWorkingDay,
		isUserAbsentOnDate,
		formatAbsenceText,
		getAvailableHoursOnDate,
		calculateAvailableHoursForPeriod,
		formatPeriodHeader,
		indexMetadata,
		resetStateOnLoad,
	});
})();
