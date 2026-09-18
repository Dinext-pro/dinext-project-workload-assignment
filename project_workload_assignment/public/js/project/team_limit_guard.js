/**
 * ISS-2026-02108: сумма лимитов ролей одного человека ≤ 100% на пересекающихся датах.
 * Пустые в overlap-кластере делят остаток; 0 на мульти-роли = 0%.
 */
const TEAM_TABLE = "custom_ts_details";
const OPEN = "0001-01-01";
const CLOSE = "9999-12-31";
const WORKER_MANDATORY_WHEN_REAL = "eval:!doc.virtual_worker";
const TYPE_MANDATORY_WHEN_VIRTUAL = "eval:doc.virtual_worker";
const TYPE_READONLY_WHEN_REAL = "eval:!doc.virtual_worker";
const AUTOFILL = "__pwa_limit_autofill";

let _filling = false;

const _isEmptyLimit = (value) =>
	value === null || value === undefined || value === "";

const _isExplicitLimit = (value) => {
	if (_isEmptyLimit(value)) return false;
	const n = Number(value);
	if (!Number.isFinite(n)) return false;
	if (Math.abs(n - 100) < 0.000001) return false;
	return true;
};

const _numStored = (value) => {
	if (_isEmptyLimit(value)) return 100;
	const n = Number(value);
	if (!Number.isFinite(n)) return 100;
	return n;
};

const _personKey = (row) => {
	if (row.virtual_worker) return "";
	return String(row.pt_participant || row.pt_worker || "").trim();
};

const _iso = (value) => {
	if (!value) return "";
	const raw = String(value);
	if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
	const obj = frappe.datetime?.str_to_obj?.(raw);
	if (!obj || Number.isNaN(obj.getTime?.() ?? obj.valueOf?.())) return raw;
	const y = obj.getFullYear();
	const m = String(obj.getMonth() + 1).padStart(2, "0");
	const d = String(obj.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
};

const _start = (row) => _iso(row.pt_valid_from) || OPEN;
const _end = (row) => _iso(row.pt_valid_for) || CLOSE;

const _isEmptyForFill = (row) =>
	!_isExplicitLimit(row.workload_limit) || !!row[AUTOFILL];

const _addDay = (iso) => {
	if (iso === CLOSE) return CLOSE;
	const obj = frappe.datetime.str_to_obj(iso);
	obj.setDate(obj.getDate() + 1);
	const y = obj.getFullYear();
	const m = String(obj.getMonth() + 1).padStart(2, "0");
	const d = String(obj.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
};

const _intervalsOverlap = (a, b) => _start(a) <= _end(b) && _start(b) <= _end(a);

const _overlapComponents = (rows) => {
	const parent = rows.map((_, index) => index);
	const find = (index) => {
		while (parent[index] !== index) {
			parent[index] = parent[parent[index]];
			index = parent[index];
		}
		return index;
	};
	for (let i = 0; i < rows.length; i += 1) {
		for (let j = i + 1; j < rows.length; j += 1) {
			if (!_intervalsOverlap(rows[i], rows[j])) continue;
			const rootI = find(i);
			const rootJ = find(j);
			if (rootI !== rootJ) parent[rootJ] = rootI;
		}
	}
	const groups = {};
	rows.forEach((row, index) => {
		const root = find(index);
		(groups[root] || (groups[root] = [])).push(row);
	});
	return Object.values(groups);
};

const _singleLimit = (row) => {
	if (_isEmptyForFill(row) || Number(row.workload_limit) <= 0) return 100;
	return Number(row.workload_limit);
};

const _resolveComponent = (rows) => {
	if (!rows.length) return [];
	if (rows.length === 1) return [_singleLimit(rows[0])];

	const resolved = rows.map(() => 0);
	const emptyIndexes = [];
	let explicitSum = 0;
	rows.forEach((row, index) => {
		if (!_isEmptyForFill(row)) {
			const number = Number(row.workload_limit);
			resolved[index] = number;
			explicitSum += number;
		} else {
			emptyIndexes.push(index);
		}
	});
	if (!emptyIndexes.length) return resolved;

	const remaining = 100 - explicitSum;
	if (remaining < -0.000001) return resolved;

	const share = Math.round((remaining / emptyIndexes.length) * 100) / 100;
	emptyIndexes.forEach((index, offset) => {
		resolved[index] =
			offset === emptyIndexes.length - 1
				? Math.round((remaining - share * (emptyIndexes.length - 1)) * 100) / 100
				: share;
	});
	return resolved;
};

const _writeLimit = (row, value) => {
	const wasAuto = _isEmptyForFill(row);
	if (!row || !row.doctype || !row.name) {
		row.workload_limit = value;
		row[AUTOFILL] = wasAuto;
		return;
	}
	const current = Number(row.workload_limit);
	if (!wasAuto && Math.abs(current - value) < 0.000001) {
		return;
	}
	frappe.model.set_value(row.doctype, row.name, "workload_limit", value);
	row[AUTOFILL] = wasAuto;
};

const _fillRows = (rows, includeSingles) => {
	_overlapComponents(rows).forEach((component) => {
		if (!includeSingles && component.length < 2) return;
		if (component.length > 1) {
			let explicitSum = 0;
			component.forEach((row) => {
				if (!_isEmptyForFill(row)) {
					explicitSum += Number(row.workload_limit);
				}
			});
			if (100 - explicitSum < -0.000001) return;
		}
		const filled = _resolveComponent(component);
		component.forEach((row, index) => {
			_writeLimit(row, filled[index]);
		});
	});
};

const _peakSum = (rows) => {
	const events = [];
	_overlapComponents(rows).forEach((component) => {
		const filled = _resolveComponent(component);
		component.forEach((row, index) => {
			events.push({ day: _start(row), sign: 1, limit: filled[index] });
			events.push({ day: _addDay(_end(row)), sign: -1, limit: filled[index] });
		});
	});
	events.sort((a, b) => (a.day === b.day ? a.sign - b.sign : a.day < b.day ? -1 : 1));
	let current = 0;
	let peak = 0;
	for (const ev of events) {
		current += ev.sign * ev.limit;
		if (current > peak) peak = current;
	}
	return peak;
};

const _teamRows = (frm) => (frm.doc[TEAM_TABLE] || []).filter(Boolean);

const _personGroups = (frm) => {
	const groups = {};
	for (const row of _teamRows(frm)) {
		const key = _personKey(row);
		if (!key) continue;
		(groups[key] || (groups[key] = [])).push(row);
	}
	return groups;
};

const _fillAll = (frm) => {
	_filling = true;
	try {
		Object.values(_personGroups(frm)).forEach((rows) => _fillRows(rows, true));
	} finally {
		_filling = false;
	}
};

const _label = (row) => row.pt_role || row.pt_participant || row.pt_worker || "";

const _showLimitError = (lines, title) => {
	const dialog = new frappe.ui.Dialog({
		title: title || __("Workload limit"),
		indicator: "red",
	});
	dialog.$body.html(lines.join("<br>"));
	dialog.show();
};

const _bindTeamFieldRules = (frm) => {
	const grid = frm.get_field(TEAM_TABLE)?.grid;
	if (!grid) return;
	if (frappe.meta.get_docfield("Project Team Details", "pt_worker")) {
		grid.update_docfield_property(
			"pt_worker",
			"mandatory_depends_on",
			WORKER_MANDATORY_WHEN_REAL
		);
	}
	if (frappe.meta.get_docfield("Project Team Details", "worker_type")) {
		grid.update_docfield_property("worker_type", "in_list_view", 0);
		grid.update_docfield_property(
			"worker_type",
			"read_only_depends_on",
			TYPE_READONLY_WHEN_REAL
		);
		grid.update_docfield_property("worker_type", "read_only", 0);
		grid.update_docfield_property(
			"worker_type",
			"mandatory_depends_on",
			TYPE_MANDATORY_WHEN_VIRTUAL
		);
	}
};

const _missingWorkers = (frm) => {
	if (!frappe.meta.get_docfield("Project Team Details", "pt_worker")) return [];
	return _teamRows(frm)
		.map((row, index) => ({ row, index }))
		.filter(({ row }) => !row.virtual_worker && !String(row.pt_worker || "").trim())
		.map(({ row, index }) =>
			__("- {0} (row {1})", [_label(row) || String(index + 1), index + 1])
		);
};

const _validTypes = new Set(["Employee", "Supplier"]);

const _missingTypes = (frm) =>
	_teamRows(frm)
		.map((row, index) => ({ row, index }))
		.filter(
			({ row }) =>
				row.virtual_worker && !_validTypes.has(String(row.worker_type || "").trim())
		)
		.map(({ row, index }) =>
			__("- {0} (row {1})", [_label(row) || String(index + 1), index + 1])
		);

const _rowOverCeiling = (row) => {
	if (_isEmptyLimit(row.workload_limit)) return false;
	const n = Number(row.workload_limit);
	return Number.isFinite(n) && n > 100.000001;
};

const _violations = (frm) => {
	const ceiling = _teamRows(frm)
		.filter(_rowOverCeiling)
		.map((row) => ({
			person: _label(row) || (row.virtual_worker ? "virtual" : ""),
			peak: Number(row.workload_limit),
			rows: [row],
			kind: "ceiling",
		}));
	const sums = Object.entries(_personGroups(frm))
		.filter(([, rows]) => rows.length > 1 && _peakSum(rows) > 100.000001)
		.map(([person, rows]) => ({
			person,
			peak: _peakSum(rows),
			rows,
			kind: "sum",
		}));
	return [...ceiling, ...sums];
};

const applyRemainder = (frm, cdt, cdn) => {
	if (_filling) return;
	const row = locals[cdt][cdn];
	if (!row || !_personKey(row)) return;
	const peers = _teamRows(frm).filter((other) => _personKey(other) === _personKey(row));
	_filling = true;
	try {
		_fillRows(peers, true);
	} finally {
		_filling = false;
	}
};

frappe.ui.form.on("Project", {
	onload(frm) {
		_bindTeamFieldRules(frm);
	},
	refresh(frm) {
		_bindTeamFieldRules(frm);
	},
	validate(frm) {
		const noWorker = _missingWorkers(frm);
		if (noWorker.length) {
			const lines = [__("Fill Worker for non-virtual team members:"), ...noWorker];
			frappe.validated = false;
			_showLimitError(lines, __("Project team"));
			throw new Error(lines.join(" "));
		}
		const noType = _missingTypes(frm);
		if (noType.length) {
			const lines = [
				__("Fill Type (Employee or Supplier) for virtual team members:"),
				...noType,
			];
			frappe.validated = false;
			_showLimitError(lines, __("Project team"));
			throw new Error(lines.join(" "));
		}
		_fillAll(frm);
		const bad = _violations(frm);
		if (!bad.length) return;
		const lines = [];
		const ceiling = bad.filter((item) => item.kind === "ceiling");
		const sums = bad.filter((item) => item.kind === "sum");
		if (ceiling.length) {
			lines.push(__("Workload limit of one role cannot exceed 100%."));
			for (const item of ceiling) {
				lines.push(
					__("{0}: {1}% (max 100%)", [item.person, item.peak.toFixed(1)])
				);
			}
		}
		if (sums.length) {
			lines.push(
				__("Workload limit of one person cannot exceed 100% on overlapping dates.")
			);
			for (const item of sums) {
				lines.push(
					__("{0}: {1}% (max 100%)", [item.person, item.peak.toFixed(1)])
				);
			}
		}
		frappe.validated = false;
		_showLimitError(lines);
		throw new Error(lines.join(" "));
	},
});

const CALENDAR_FIELDS = [
	"virtual_holiday_list",
	"virtual_working_hours_on_date",
	"virtual_hours_on_date",
];

const clearVirtualCalendar = (cdt, cdn) => {
	CALENDAR_FIELDS.forEach((fieldname) => {
		if (!frappe.meta.get_docfield("Project Team Details", fieldname)) return;
		frappe.model.set_value(cdt, cdn, fieldname, null);
	});
};

frappe.ui.form.on("Project Team Details", {
	virtual_worker(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		if (!row || row.virtual_worker) return;
		clearVirtualCalendar(cdt, cdn);
	},
	pt_participant(frm, cdt, cdn) {
		applyRemainder(frm, cdt, cdn);
	},
	pt_worker(frm, cdt, cdn) {
		applyRemainder(frm, cdt, cdn);
	},
	pt_valid_from(frm, cdt, cdn) {
		applyRemainder(frm, cdt, cdn);
	},
	pt_valid_for(frm, cdt, cdn) {
		applyRemainder(frm, cdt, cdn);
	},
	workload_limit(frm, cdt, cdn) {
		if (!_filling) {
			const row = locals[cdt][cdn];
			if (row) row[AUTOFILL] = false;
		}
		applyRemainder(frm, cdt, cdn);
	},
});
