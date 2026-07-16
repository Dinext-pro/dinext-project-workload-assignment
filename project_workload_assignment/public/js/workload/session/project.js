import { SURFACE_PROJECT } from "../constants.js";
import { WorkloadSession, getSession } from "./base.js";
import { getColumns } from "../shared/columns.js";
import { loadProjectData } from "../project/data.js";
import { initFilters } from "../project/filters.js";
import { createOnCellDoubleClicked } from "../project/navigation.js";
import { reload as reloadCharts, destroy as destroyCharts } from "../charts/index.js";

function pwrProjectNS() {
	return frappe.provide("project_workload_assignment.pwrProject");
}

export class ProjectSession extends WorkloadSession {
	constructor(frm, $wrapper) {
		if (!frm) {
			throw new Error("ProjectSession: frm required");
		}
		super(frm, SURFACE_PROJECT);
		this.frm = frm;
		const s = this.state;
		s.frm = frm;
		s.wrapper = $wrapper?.[0] || $wrapper || null;
		s.isLoading = false;
		frm._pwrWorkloadV2 = true;
		frm._pwrWorkloadState = s;
	}

	_columns() {
		const s = this.state;
		return getColumns(s.periods, {
			viewType: s.filters?.view_type,
			participantWidth: s.participantWidth || 250,
		});
	}

	_bindTabChange($wrapper) {
		const s = this.state;
		if (typeof s._tabCleanup === "function") {
			s._tabCleanup();
		}

		const NS = pwrProjectNS();
		const frm = this.frm;
		const handler = (e) => {
			const tab_fieldname = $(e.target).attr("data-fieldname");
			if (tab_fieldname === "custom_загрузка") {
				if (typeof NS.applyProjectWorkloadSectionLayout === "function") {
					NS.applyProjectWorkloadSectionLayout(frm);
				}
				void reloadCharts(s);
				setTimeout(() => {
					$wrapper?.removeClass("animate");
				}, 1000);
			} else {
				setTimeout(() => {
					$wrapper?.addClass("animate");
				}, 1000);
			}
		};

		$(".nav-link[data-toggle='tab']").on("shown.bs.tab", handler);
		s._tabCleanup = () => {
			$(".nav-link[data-toggle='tab']").off("shown.bs.tab", handler);
			s._tabCleanup = null;
		};
	}

	_afterCharts() {
		const s = this.state;
		void reloadCharts(s, {
			onReload: (meta) => {
				if (meta?.chartOnly) {
					return reloadCharts(s);
				}
				return this.reload();
			},
		});
	}

	async mount() {
		const frm = this.frm;
		const NS = pwrProjectNS();
		const timer =
			typeof NS.startTimer === "function"
				? NS.startTimer("workload.project.mount")
				: null;

		let $wrapper = this.state.wrapper
			? $(this.state.wrapper)
			: frm.get_field("custom_workload")?.$wrapper;
		if (!$wrapper || !$wrapper.length) {
			if (timer && NS.endTimer) NS.endTimer(timer);
			return null;
		}

		$wrapper.addClass("project_workload_container d-flex flex-column");
		$wrapper.empty();

		this.state.wrapper = $wrapper[0];
		this.state.gridShellEl = $wrapper[0];

		initFilters({
			frm,
			$wrapper,
			state: this.state,
			onReload: () => this.reload(),
		});

		const $tableHost = $(
			'<div class="project-workload-table workload-table"></div>'
		).appendTo($wrapper);
		this.state.container = $tableHost[0];

		if (typeof NS.applyProjectWorkloadSectionLayout === "function") {
			NS.applyProjectWorkloadSectionLayout(frm);
			setTimeout(() => NS.applyProjectWorkloadSectionLayout(frm), 0);
		}

		try {
			this.state.isLoading = true;
			await this._withLoading(
				() => loadProjectData(this.state),
				__("Получение данных загрузки проекта...")
			);
		} catch (err) {
			console.error("[workload.project] load failed", err);
			frappe.msgprint({
				title: __("Error"),
				indicator: "red",
				message: err?.message || String(err),
			});
			this.state.rows = [];
			this.state.periods = [];
		} finally {
			this.state.isLoading = false;
		}

		await this._createTable({
			columns: this._columns(),
			onExpandRow: () => {},
			onCellDoubleClicked: createOnCellDoubleClicked(this.state),
		});

		this._bindTabChange($wrapper);
		frm.project_workload_table_initialized = true;
		this._afterCharts();

		if (timer && NS.endTimer) NS.endTimer(timer);
		return this.state.table;
	}

	async reload(filterArgs) {
		const s = this.state;
		if (s.isLoading) {
			return null;
		}

		try {
			s.isLoading = true;
			await this._withLoading(
				() => loadProjectData(s, filterArgs),
				__("Получение данных загрузки проекта...")
			);
		} catch (err) {
			console.error("[workload.project] refresh failed", err);
			frappe.msgprint({
				title: __("Error"),
				indicator: "red",
				message: err?.message || String(err),
			});
			return null;
		} finally {
			s.isLoading = false;
		}

		const NS = pwrProjectNS();
		const columns = this._columns();

		if (!s.table) {
			if (!s.container) return null;
			await this._createTable({
				columns,
				onExpandRow: () => {},
				onCellDoubleClicked: createOnCellDoubleClicked(s),
			});
		} else {
			this._refreshTable({ rows: s.rows, columns, collapseAll: true });
		}

		this._afterCharts();
		if (typeof NS.applyProjectWorkloadSectionLayout === "function" && s.frm) {
			NS.applyProjectWorkloadSectionLayout(s.frm);
		}
		return s.table;
	}

	destroy() {
		destroyCharts(this.state);
		if (this.frm) {
			this.frm._pwrWorkloadV2 = false;
			this.frm._pwrWorkloadState = null;
			this.frm.project_workload_table_initialized = false;
		}
		super.destroy();
	}
}

export function mountProjectSession(ctx) {
	const frm = ctx?.frm;
	if (!frm) {
		throw new Error("workload.project.mount: frm required");
	}
	const existing = getSession(frm);
	if (existing instanceof ProjectSession) {
		existing.destroy();
	}
	const $wrapper = ctx.wrapper
		? $(ctx.wrapper)
		: frm.get_field("custom_workload")?.$wrapper;
	const session = new ProjectSession(frm, $wrapper);
	return session.mount();
}

export function refreshProjectSession(ctx) {
	const session = getSession(ctx?.frm);
	if (session instanceof ProjectSession) {
		return session.reload(ctx?.filterArgs);
	}
	return mountProjectSession(ctx);
}
