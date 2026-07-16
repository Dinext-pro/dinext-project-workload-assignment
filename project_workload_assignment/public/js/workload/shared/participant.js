export function participantLabel(row) {
	if (!row) return "";
	if (row.label) return row.label;
	const ud = row.user_data || {};
	return ud.full_name || row.email || row.project || "";
}
