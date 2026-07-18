/**
 * Минимальные заглушки Frappe/jQuery для JSDoc и IDE.
 * Dev-only, не влияет на runtime.
 */

declare const frappe: FrappeNamespace;
declare const __: (text: string, args?: unknown[]) => string;
declare const cur_frm: WorkEffortsForm | undefined;

interface FrappeCallResponse<T = unknown> {
	message?: T;
}

interface FrappeNamespace {
	call: (opts: {
		method: string;
		args?: Record<string, unknown>;
		freeze?: boolean;
		freeze_message?: string;
		callback?: (r: FrappeCallResponse) => void;
		error?: (err: unknown) => void;
	}) => void;
	provide: (namespace: string) => object;
	logger: (name: string) => Console;
	show_alert: (opts: { message: string; indicator: string }, duration?: number) => void;
	msgprint: (message: string) => void;
	confirm: (message: string, onyes: () => void) => void;
	datetime: {
		month_start: () => string;
		str_to_obj: (date: string | Date) => Date;
		obj_to_str: (date: Date) => string;
		add_months: (date: string | Date, months: number) => string;
	};
	db: {
		get_list: (doctype: string, opts: object) => Promise<unknown[]>;
		get_doc: (doctype: string, name: string) => Promise<unknown>;
		insert: (doc: object) => Promise<unknown>;
		exists: (doctype: string, name: string) => Promise<boolean>;
		get_value: (doctype: string, name: string, field: string) => Promise<unknown>;
	};
	model: {
		add_child: (doc: unknown, doctype: string, fieldname: string) => unknown;
	};
	ui: {
		form: {
			on: (doctype: string, handler: object | string, fn?: Function) => void;
			make_control: (opts: object) => unknown;
		};
		Dialog: new (opts: object) => {
			show: () => void;
			hide: () => void;
			$wrapper: JQuery;
			datatable?: StickyDataTableInstance;
		};
	};
	Chart: new (element: HTMLElement, opts: object) => {
		destroy: () => void;
		update: (data: unknown) => void;
	};
}

declare class StickyDataTable {
	constructor(container: HTMLElement, opts: object);
}

interface JQuery {
	tooltip: (action?: string) => JQuery;
}

interface JQueryStatic {
	(document: unknown): JQuery;
}

/** Публичный API Work Efforts (frappe.provide + Object.assign в we-*.js). */
interface DinextProjectsWorkEfforts {
	applyWorkEffortsStyles: () => void;
	clearTaskIndexCacheFor: (
		aggregatedTasks: Record<string, ConsolidatedTaskEntry> | ConsolidatedTaskEntry[] | null
	) => void;
	makeAggregator: (aggregatedTasks: unknown) => object | null;
	calc_we_column_total_optimized: (
		frm: WorkEffortsForm,
		roles: string[],
		period: DisplayPeriod,
		calc_plan?: boolean,
		calc_fact?: boolean
	) => ColumnTotal;
	load_all_assignments_if_needed: (frm: WorkEffortsForm) => Promise<void>;
	get_task_assignments: (task_id: string) => WorkloadAssignment[];
	check_plan_load_for_percentage_assignments: (frm: WorkEffortsForm) => void;
	load_detailed_assignments: (frm: WorkEffortsForm) => Promise<void>;
	clear_assignments_cache: () => void;
	expandParents: (frm: WorkEffortsForm, missingPlanMap: Record<string, string[]>) => void;
	initCustomTooltip: () => void;
	showCustomTooltip: (target: Element, text: string) => void;
	hideCustomTooltip: () => void;
	isPeriodInTaskDates: (
		period: DisplayPeriod,
		startDate: string | null | undefined,
		endDate: string | null | undefined
	) => boolean;
	hasWorkloadInPeriod: (
		frm: WorkEffortsForm,
		taskId: string,
		role: string,
		period: DisplayPeriod
	) => boolean;
	buildWorkloadPeriodsMap: (frm: WorkEffortsForm) => Promise<void>;
	render_work_efforts_chart: (frm: WorkEffortsForm, init?: boolean) => void;
	build_chart_data: (frm: WorkEffortsForm, selectedRole: string) => object;
	get_chart_data: (frm: WorkEffortsForm, selectedRole: string) => object;
	perform_overload_check: (frm: WorkEffortsForm) => void;
	show_overload_details_dialog: (
		overloads: Array<{ task: string; role: string; months?: unknown[] }>,
		frm: WorkEffortsForm
	) => void;
	escape_html: (str: string) => string;
	update_forecast_from_assignments: (
		frm: WorkEffortsForm,
		selectedRows: Array<{ task: string; role: string; months: unknown[] }>,
		dialog?: unknown
	) => void;
	get_project_roles: (frm: WorkEffortsForm) => string[];
	get_display_periods: (frm: WorkEffortsForm, periodType: string) => DisplayPeriod[];
	addViewOptionsControl: (frm: WorkEffortsForm, controls: JQuery) => void;
	render_legend: (container: JQuery) => void;
	load_work_efforts_data: (
		frm: WorkEffortsForm,
		periodType: string,
		unit: string,
		updateRows?: boolean
	) => void;
	rollup_fact_data: (aggregatedTasks: Record<string, ConsolidatedTaskEntry>) => void;
	get_columns_definition: (frm: WorkEffortsForm, periodType: string, unit: string) => object[];
	updateForecastValue: (
		task: string,
		role: string,
		year: number | string,
		month: number | string,
		new_value: number
	) => void;
	save_forecast_as_plan: (frm: WorkEffortsForm) => void;
	recalculatePeriodLimits: (
		frm: WorkEffortsForm,
		periodType: string,
		callback?: () => void
	) => void;
	setCellStyles: () => void;
	render_work_efforts_table: (frm: WorkEffortsForm) => void;
	updateTable: (
		frm: WorkEffortsForm,
		periodType: string,
		unit: string,
		skipRestore?: boolean
	) => void;
	syncPlTaskDimensionFromWe: (frm: WorkEffortsForm) => void;
	calc_we_column_total: (
		frm: WorkEffortsForm,
		roles: string[],
		period: DisplayPeriod,
		calc_plan?: boolean,
		calc_fact?: boolean
	) => ColumnTotal;
}

declare namespace project_workload_assignment {
	const work_efforts: DinextProjectsWorkEfforts;
}
