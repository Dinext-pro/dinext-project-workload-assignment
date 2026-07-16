export function mountRow(el) {
	el.replaceChildren();

	const row = document.createElement("div");
	row.className = "wr-filters-row";

	const flow = document.createElement("div");
	flow.className = "wr-filters-flow";

	const buttons = document.createElement("div");
	buttons.className = "wr-filters-actions";

	row.append(flow, buttons);
	el.appendChild(row);
	return { row, flow, buttons };
}

export function addSelect(parent, { fieldname, options, value, onChange }) {
	const wrap = document.createElement("div");
	wrap.className = "wr-filter-field wr-filter-select";
	if (fieldname) {
		wrap.dataset.fieldname = fieldname;
	}
	parent.appendChild(wrap);

	// set_value on mount fires change — ignore until ready
	let ready = false;
	const control = frappe.ui.form.make_control({
		parent: wrap,
		df: {
			fieldtype: "Select",
			fieldname,
			input_class: "input-xs",
			options: options.map((o) => ({ value: o.value, label: o.label })),
			change: () => {
				if (!ready) return;
				onChange(control.get_value() ?? "");
			},
		},
		render_input: true,
	});

	control.set_value(value ?? "");
	ready = true;
	return control;
}

export function addCheckbox(parent, { label, checked, onChange }) {
	const wrap = document.createElement("div");
	wrap.className = "wr-filter-field wr-filter-checkbox";

	const lbl = document.createElement("label");
	const input = document.createElement("input");
	input.type = "checkbox";
	input.checked = !!checked;
	input.addEventListener("change", () => onChange(!!input.checked));

	const span = document.createElement("span");
	span.textContent = label;

	lbl.append(input, span);
	wrap.appendChild(lbl);
	parent.appendChild(wrap);
	return input;
}

export function addPeriodNav(parent, { onPrev, onNext }) {
	const nav = document.createElement("div");
	nav.className = "wr-filter-period-nav";

	const prev = document.createElement("button");
	prev.type = "button";
	prev.className = "btn btn-xs btn-default";
	prev.textContent = "<";
	prev.title = __("Previous month");
	prev.addEventListener("click", onPrev);

	const next = document.createElement("button");
	next.type = "button";
	next.className = "btn btn-xs btn-default";
	next.textContent = ">";
	next.title = __("Next month");
	next.addEventListener("click", onNext);

	nav.append(prev, next);
	parent.appendChild(nav);
	return nav;
}

export function addButton(parent, { title, text, onClick, className }) {
	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = ["btn", "btn-default", "btn-sm", "wr-filters-icon-btn", className]
		.filter(Boolean)
		.join(" ");
	btn.title = title;
	btn.textContent = text;
	btn.addEventListener("click", onClick);
	parent.appendChild(btn);
	return btn;
}
