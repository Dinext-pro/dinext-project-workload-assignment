/**
 * ISS-2026-02108: сумма лимитов ролей одного человека ≤ 100% на пересекающихся датах.
 * Пустые в overlap-кластере делят остаток; 0 на мульти-роли = 0%.
 */
const TEAM_TABLE = "custom_ts_details";
const OPEN = "0001-01-01";
const CLOSE = "9999-12-31";

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

const _start = (row) => row.pt_valid_from || OPEN;
const _end = (row) => row.pt_valid_for || CLOSE;

const _addDay = (iso) => {
	if (iso === CLOSE) return CLOSE;
	const obj = frappe.datetime.str_to_obj(iso);
	obj.setDate(obj.getDate() + 1);
	return frappe.datetime.obj_to_str(obj);
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

const _singleLimit = (value) => {
	if (!_isExplicitLimit(value) || Number(value) <= 0) return 100;
	return Number(value);
};

const _resolveComponent = (rows) => {
	if (!rows.length) return [];
	if (rows.length === 1) return [_singleLimit(rows[0].workload_limit)];

	const resolved = rows.map(() => 0);
	const emptyIndexes = [];
	let explicitSum = 0;
	rows.forEach((row, index) => {
		if (_isExplicitLimit(row.workload_limit)) {
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
	if (!row || !row.doctype || !row.name) {
		row.workload_limit = value;
		return;
	}
	const current = Number(row.workload_limit);
	if (_isExplicitLimit(row.workload_limit) && Math.abs(current - value) < 0.000001) {
		return;
	}
	frappe.model.set_value(row.doctype, row.name, "workload_limit", value);
};

const _fillRows = (rows, includeSingles) => {
	_overlapComponents(rows).forEach((component) => {
		if (!includeSingles && component.length < 2) return;
		if (component.length > 1) {
			let explicitSum = 0;
			component.forEach((row) => {
				if (_isExplicitLimit(row.workload_limit)) {
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
		_fillRows(peers, false);
	} finally {
		_filling = false;
	}
};

frappe.ui.form.on("Project", {
	validate(frm) {
		_fillAll(frm);
		const bad = _violations(frm);
		if (!bad.length) return;
		const lines = [];
		const ceiling = bad.filter((item) => item.kind === "ceiling");
		const sums = bad.filter((item) => item.kind === "sum");
		if (ceiling.length) {
			lines.push(__("Workload limit of one role cannot exceed 100%."));
			for (const item of ceiling) {
				const roles = item.rows.map(_label).filter(Boolean).join(", ");
				lines.push(`${item.person}: ${item.peak.toFixed(1)}% (${roles})`);
			}
		}
		if (sums.length) {
			lines.push(
				__("Workload limit of one person cannot exceed 100% on overlapping dates.")
			);
			for (const item of sums) {
				const roles = item.rows.map(_label).filter(Boolean).join(", ");
				lines.push(`${item.person}: ${item.peak.toFixed(1)}% (${roles})`);
			}
		}
		frappe.msgprint({
			title: __("Workload limit"),
			message: lines.join("<br>"),
			indicator: "red",
		});
		frappe.validated = false;
	},
});

frappe.ui.form.on("Project Team Details", {
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
		applyRemainder(frm, cdt, cdn);
	},
});
