// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

frappe.query_reports["Flat Workload Report"] = {
	"filters": [
		{
			"fieldname": "from_date",
			"label": __("Дата с"),
			"fieldtype": "Date",
			"default": frappe.datetime.get_today(),
			"reqd": 0
		},
		{
			"fieldname": "to_date",
			"label": __("Дата по"),
			"fieldtype": "Date",
			"default": frappe.datetime.add_days(frappe.datetime.get_today(), 90),
			"reqd": 0
		},
		{
			"fieldname": "user",
			"label": __("Пользователь"),
			"fieldtype": "Link",
			"options": "User",
			"reqd": 0
		},
		{
			"fieldname": "user_group",
			"label": __("Группа пользователей"),
			"fieldtype": "Link",
			"options": "User Group",
			"reqd": 0
		},
		{
			"fieldname": "project",
			"label": __("Проект"),
			"fieldtype": "Link",
			"options": "Project",
			"reqd": 0
		},
		{
			"fieldname": "task",
			"label": __("Задача"),
			"fieldtype": "Link",
			"options": "Task",
			"reqd": 0,
			"get_query": function() {
				return {
					"filters": {
						"project": frappe.query_report.get_filter_value("project")
					}
				};
			}
		}
	]
};
