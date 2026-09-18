import { resolveDisplayLimitPercent } from "./capacity.js";

/** Label column content: avatar for user, plain label for other kinds. */

const _el = (tag, className, text) => {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text != null && text !== "") node.textContent = text;
	return node;
};

const _initial = (name) => ((name && name.charAt(0)) || "U").toUpperCase();

const _buildAvatar = (name, imageUrl) => {
	const wrap = _el("span", "wr-participant__avatar-wrap");
	const placeholder = _el("div", "wr-participant__avatar-placeholder", _initial(name));

	if (!imageUrl) {
		wrap.append(placeholder);
		return wrap;
	}

	const img = document.createElement("img");
	img.className = "wr-participant__avatar";
	img.src = imageUrl;
	img.alt = name || "";
	img.addEventListener("error", () => {
		img.remove();
		placeholder.classList.add("wr-participant__avatar-placeholder--visible");
	});
	wrap.append(img, placeholder);
	return wrap;
};

const _userBlock = (row) => {
	const ud = row.user_data || {};
	const fullName = ud.full_name || row.label || "";
	const email = ud.email || row.email || "";
	const image = ud.user_image || "";

	const root = _el("div", "wr-participant wr-participant--user");
	root.append(_buildAvatar(fullName, image));

	const info = _el("div", "wr-participant__info");
	const nameEl = _el("div", "wr-participant__name", fullName);
	nameEl.title = fullName;
	info.append(nameEl);
	if (email) {
		const emailEl = _el("div", "wr-participant__email", email);
		emailEl.title = email;
		info.append(emailEl);
	}
	root.append(info);
	return root;
};

const _segmentLine = (segment) => {
	const from = segment.pt_valid_from || "…";
	const to = segment.pt_valid_for || "…";
	const role = segment.role ? `${segment.role}: ` : "";
	const pct = Math.round(Number(segment.limit) || 0);
	return `${role}${from}–${to}: ${pct}%`;
};

const _limitTooltip = (row) => {
	const segs = row?.workload_limit_segments || [];
	if (!segs.length) return "";
	const lines = segs.map(_segmentLine);
	lines.push(
		`${__("Calculation uses the minimum")}: ${resolveDisplayLimitPercent(row)}%`
	);
	return lines.join("\n");
};

const _textBlock = (text, mod, rightText, tip) => {
	const root = _el("div", `wr-participant wr-participant--${mod}`);
	const label = _el("div", "wr-participant__label", text || "");
	label.title = text || "";
	root.append(label);
	if (rightText) {
		const limitEl = _el("div", "wr-participant__limit", rightText);
		if (tip) limitEl.title = tip;
		root.append(limitEl);
	}
	return root;
};

const _roleLimitText = (row, opts) => {
	if (!opts?.applyLimit) return "";
	const pct = `${resolveDisplayLimitPercent(row)}%`;
	return row.workload_limit_approx ? `~${pct}` : pct;
};

/** Tree `render` — returns HTMLElement for label column. */
export const renderParticipant = (params, opts = {}) => {
	const row = params?.data;
	if (!row) return "";

	switch (row.kind) {
		case "user":
			return _userBlock(row);
		case "project":
			return _textBlock(row.label || row.project || __("No Project"), "project");
		case "role":
			return _textBlock(
				row.label || row.role || "",
				"role",
				_roleLimitText(row, opts),
				_limitTooltip(row)
			);
		case "task":
			return _textBlock(row.label || row.task || "", "task");
		case "absence":
			return _textBlock(__("Absences"), "absence");
		case "placeholder":
			return _textBlock(row.label || __("Loading..."), "placeholder");
		default:
			return _textBlock(row.label || params?.value || "", "default");
	}
};
