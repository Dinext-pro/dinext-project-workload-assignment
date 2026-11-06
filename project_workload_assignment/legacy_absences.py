# ruff: noqa: RUF001
"""Migrate the active legacy report's AFL query with its API shape intact."""

import re

import frappe


_QUERY = re.compile(
	r'^(?P<indent>[ \t]+)absences_query = """\s*'
	r"SELECT `name`, `lauser`, `alfrom_date`, `alto_date`, `altype_of_leave`\s*"
	r"FROM `tabApplication For Leave`\s*"
	r'WHERE `lauser` IN \(""" \+ placeholders \+ """\)\s*'
	r"AND `status` = 'Согласовано'\s*"
	r"AND `alfrom_date` IS NOT NULL\s*AND `alto_date` IS NOT NULL\s*"
	r'"""\s*\n(?P=indent)absences = frappe\.db\.sql\(absences_query, users, as_dict=True\)',
	re.MULTILINE,
)
_ABSENCES = """absences = frappe.get_all(
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


def migrate_legacy_absence_query():
	"""Update only the enabled site-managed script with the known query."""
	name = "Get Projects Workload Data"
	script = frappe.db.get_value("Server Script", {"name": name, "disabled": 0}, "script")
	if not script:
		return

	def query(match):
		indent = match.group("indent")
		return "\n".join(indent + line.expandtabs(4) for line in _ABSENCES.splitlines())

	updated, count = _QUERY.subn(query, script)
	if count == 1:
		compile(updated, name, "exec")
		frappe.db.set_value("Server Script", name, "script", updated, update_modified=False)
