/**
 * DinextTable uses ":" as tree path separator (parent:child).
 * Canonical ids like "user:email" / "project:email:name" must not contain ":".
 */
const PATH_SAFE = "|";

export const encodeRowId = (id) => String(id ?? "").split(":").join(PATH_SAFE);

const _mapRow = (row) => {
	if (!row || typeof row !== "object") return row;
	const out = { ...row, id: encodeRowId(row.id) };
	if (Array.isArray(row.children)) {
		out.children = row.children.map(_mapRow);
	}
	return out;
};

export const toTableRows = (rows) => (rows || []).map(_mapRow);
