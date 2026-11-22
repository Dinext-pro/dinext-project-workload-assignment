"""Prepare the legacy AFL query for guarded workflow cutover."""

import json
import re

import frappe
from frappe import _

from project_workload_assignment.approval_statuses import APPROVED_STATUSES

_SCRIPT_NAME = "Get Projects Workload Data"
_LEGACY_QUERY = re.compile(
	r'^(?P<indent>[ \t]+)absences_query = """\s*'
	r"SELECT `name`, `lauser`, `alfrom_date`, `alto_date`, `altype_of_leave`\s*"
	r"FROM `tabApplication For Leave`\s*"
	r'WHERE `lauser` IN \(""" \+ placeholders \+ """\)\s*'
	r"AND `status` = 'Согласовано'\s*"
	r"AND `alfrom_date` IS NOT NULL\s*AND `alto_date` IS NOT NULL\s*"
	r'"""\s*\n(?P=indent)absences = frappe\.db\.sql\(absences_query, users, as_dict=True\)(?=\r?$)',
	re.MULTILINE,
)
_APPROVED_ONLY = """absences = frappe.get_all(
	"Application For Leave",
	fields=["name", "lauser", "alfrom_date", "alto_date", "altype_of_leave"],
	filters={
		"lauser": ["in", users],
		"status": "Approved",
		"alfrom_date": ["is", "set"],
		"alto_date": ["is", "set"],
	},
	limit_page_length=0,
)"""
_COMPATIBLE = _APPROVED_ONLY.replace(
	'"status": "Approved"', f'"status": ["in", {json.dumps(APPROVED_STATUSES, ensure_ascii=False)}]'
)


def _query_pattern(query: str) -> re.Pattern:
	first, *rest = query.expandtabs(4).splitlines()
	body = "".join(r"\r?\n(?P=indent)" + re.escape(line) for line in rest)
	return re.compile(r"^(?P<indent>[ \t]+)" + re.escape(first) + body + r"(?=\r?$)", re.MULTILINE)


_APPROVED_ONLY_PATTERN = _query_pattern(_APPROVED_ONLY)
_COMPATIBLE_PATTERN = _query_pattern(_COMPATIBLE)


def plan_legacy_absence_query(*, for_update: bool = False) -> str | None:
	"""Return the exact replacement source for an enabled, recognized report script."""
	record = frappe.db.get_value(
		"Server Script",
		_SCRIPT_NAME,
		["disabled", "script_type", "api_method", "script"],
		as_dict=True,
		for_update=for_update,
	)
	if not record or record.disabled:
		return None

	script = record.script or ""
	error = _("Review the Application For Leave query in Server Script {0} before cutover.").format(
		_SCRIPT_NAME
	)
	if (
		record.script_type != "API"
		or record.api_method != "get_projects_workload_data"
		or script.count("Application For Leave") != 1
	):
		raise ValueError(error)
	if _COMPATIBLE_PATTERN.search(script):
		return None
	match = _LEGACY_QUERY.search(script) or _APPROVED_ONLY_PATTERN.search(script)
	if not match:
		raise ValueError(error)

	indent = match.group("indent")
	newline = "\r\n" if "\r\n" in match.group() else "\n"
	query = newline.join(indent + line for line in _COMPATIBLE.expandtabs(4).splitlines())
	updated = script[: match.start()] + query + script[match.end() :]
	try:
		compile(updated, _SCRIPT_NAME, "exec")
	except SyntaxError:
		raise ValueError(error) from None
	return updated


def migrate_legacy_absence_query() -> None:
	"""Recheck and update under the workflow coordinator's transaction."""
	updated = plan_legacy_absence_query(for_update=True)
	if updated is not None:
		frappe.db.set_value("Server Script", _SCRIPT_NAME, "script", updated, update_modified=False)
