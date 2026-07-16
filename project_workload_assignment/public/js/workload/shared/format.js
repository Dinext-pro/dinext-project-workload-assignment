export function formatHours(value) {
	if (value == null || value === "") return "";
	const n = typeof value === "number" ? value : parseFloat(String(value));
	if (!Number.isFinite(n)) return "";
	return n.toFixed(1);
}

export function formatHoursCell(params) {
	return formatHours(params?.value);
}

export function formatPct(value) {
	if (value == null || value === "") return "";
	const n = typeof value === "number" ? value : parseFloat(String(value));
	if (!Number.isFinite(n)) return "";
	return `${Math.round(n)}%`;
}

export function formatPctCell(params) {
	return formatPct(params?.value);
}
