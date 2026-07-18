/**
 * Work Efforts JS types — зеркало dinext_projects/work_efforts/models.py.
 * Dev-only: не подключается в hooks.py, используется IDE и JSDoc.
 */

/** Строка role_data; дополнительно plan_*, forecast_*, fact_*, fact_utps_* по периодам. */
interface WorkEffortRoleEntry {
	role?: string;
	[key: string]: string | number | string[] | undefined;
}

/** Задача с агрегированными plan/forecast/fact по ролям (ответ get_work_efforts_consolidated_data). */
interface ConsolidatedTaskEntry {
	value: string;
	subject?: string | null;
	expandable?: number | boolean;
	parent_task?: string | null;
	type?: string | null;
	status?: string | null;
	custom_linked_issue?: string | null;
	color?: string | null;
	exp_start_date?: string | null;
	exp_end_date?: string | null;
	custom_planned_start_date?: string | null;
	custom_planned_end_date?: string | null;
	act_start_date?: string | null;
	act_end_date?: string | null;
	indent?: number;
	role_data?: WorkEffortRoleEntry[];
	has_overload?: boolean;
}

/** @typedef {ConsolidatedTaskEntry[]} ConsolidatedDataResponse */
type ConsolidatedDataResponse = ConsolidatedTaskEntry[];

/** Период отображения таблицы / графика. */
interface DisplayPeriod {
	year: number;
	month: number;
	is_past: boolean;
}

/** Одна позиция UTP для calculate_timesheet_limits. */
interface TimesheetPositionInput {
	name?: string | null;
	document_name?: string | null;
	project_role?: string | null;
	project?: string | null;
	status?: string | null;
	year?: number | null;
	month?: number | null;
	all_hours?: number | string | null;
	custom_username?: string | null;
}

type LimitStatus = "no-plan" | "block" | "warning" | "message" | "normal";

/** Результат расчёта лимита для одной позиции UTP. */
interface TimesheetLimitResult {
	project?: string | null;
	position?: string | null;
	document_name?: string;
	role?: string;
	planned_hours?: number;
	total_hours?: number;
	hours_data?: Record<string, number | Set<string>>;
	completion_percentage?: number;
	status?: LimitStatus;
	limit?: number;
	used_parent_for_plan?: boolean;
	used_children_for_actual?: boolean;
	child_tasks_count?: number;
	task_subject?: string;
	plan_required?: boolean;
	plan_task_subject?: string;
	has_linked_issue?: boolean | null;
	root_task_with_issue?: string | null;
}

/** @typedef {TimesheetLimitResult[]} TimesheetLimitsResponse */
type TimesheetLimitsResponse = TimesheetLimitResult[];

/** Запись для save_forecast_as_plan. */
interface SaveForecastAsPlanItem {
	task?: string;
	role?: string | null;
	year?: number | string;
	month?: number | string;
	plan_value?: number | string;
}

/** Статус лимита по ячейке периода (frm.periodLimitStatuses). */
interface PeriodLimitStatus {
	status: LimitStatus | string;
	pct: number;
	limit: number;
}

/** Назначение PWA из frappe.client.get_list. */
interface WorkloadAssignment {
	task: string;
	role?: string | null;
	user?: string;
	user_full_name?: string;
	workload?: string;
	wl_value?: number | string;
	date_from?: string | null;
	date_to?: string | null;
}

/** Сумма plan/actual по колонке периода. */
interface ColumnTotal {
	plan: number;
	actual: number;
}

/** Расширение frappe.ui.form.Form для вкладки Work Efforts на Project. */
interface WorkEffortsForm {
	doc: {
		name: string;
		expected_start_date?: string;
		expected_end_date?: string;
		custom_ts_details?: Array<{ pt_role: string }>;
		custom_limit_control_table?: Array<{ type: string; limit: number }>;
	};
	aggregatedTasks: Record<string, ConsolidatedTaskEntry> | null;
	aggregatedBudget?: Record<string, { task?: string }>;
	work_efforts_dt?: StickyDataTableInstance;
	periodLimitStatuses?: Record<string, PeriodLimitStatus>;
	we_periods?: Record<string, DisplayPeriod[]>;
	view_options?: string;
	hide_plan?: boolean;
	show_assignments?: boolean;
	last_loaded_project?: string | null;
	last_loaded_time?: Date | null;
	_we_selected_role?: string;
	_we_chart_instance?: { destroy: () => void; update: (data: unknown) => void };
	_overloadMap?: Record<string, Array<{
		year: number;
		month: number;
		forecast_hours: number;
		assigned_hours: number;
		overload_hours: number;
	}>>;
	_missingPlanMap?: Record<string, string[]>;
	_missingPlanPeriodsMap?: Record<string, Record<string, Array<{ year: number; month: number; period_key: string }>>>;
	_detailedAssignments?: Record<string, WorkloadAssignment[]>;
	_detailedAssignmentsLoaded?: boolean;
	_workloadPeriodsMap?: Record<string, Record<string, Set<string>>>;
	get_field: (fieldname: string) => { $wrapper: JQuery };
}

/** Минимальный контракт StickyDataTable, используемый в WE. */
interface StickyDataTableInstance {
	freeze: () => void;
	unfreeze: () => void;
	refresh: (data: ConsolidatedTaskEntry[]) => void;
	setStickyColumnsCount: (count: number) => void;
	bodyRenderer?: { visibleRowIndices?: number[] };
	rowmanager: {
		collapseAllNodes: () => void;
		showRows: (indices: number[]) => void;
		openSingleNode: (index: number) => void;
		getCheckedRows?: () => number[];
	};
	datamanager: {
		data: ConsolidatedTaskEntry[];
		getRows: () => unknown[];
		getData: (index: number) => ConsolidatedTaskEntry;
	};
}
