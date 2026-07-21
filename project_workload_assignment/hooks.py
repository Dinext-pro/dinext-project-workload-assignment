app_name = "project_workload_assignment"
app_title = "Dinext Project Workload"
app_publisher = "Dinext"
app_description = "Dinext Project Workload"
app_email = "info@dinord.ru"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "project_workload_assignment",
# 		"logo": "/assets/project_workload_assignment/logo.png",
# 		"title": "Project Workload Assignment",
# 		"route": "/project_workload_assignment",
# 		"has_permission": "project_workload_assignment.api.permission.has_app_permission"
# 	}
# ]

fixtures = [
    {
        "doctype": "Server Script",
        "filters": [
            ["module", "in", ["Project Workload Assignment"]]
        ]
    },
    {
        "doctype": "Client Script",
        "filters": [
            ["module", "in", ["Project Workload Assignment"]]
        ]
    },
    {
        "doctype": "Custom Field",
        "filters": [
            ["module", "in", ["Project Workload Assignment"]]
        ]
    },
]
''''''

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
app_include_css = [
	"/assets/project_workload_assignment/css/assignment_styles.css",
	"/assets/project_workload_assignment/css/tab-loading.css",
]
# Projects Workload Report is custom DocType → FormMeta.add_code() skipped
# (no doctype_js). Form UI boots via report-form/entry.js (app_include, route-gated).
# No Client Script / Server Script for this Form UI.
app_include_js = [
	"/assets/project_workload_assignment/js/core/form-tab.js",
	"/assets/project_workload_assignment/js/workload-reports/report-form/entry.js",
	"/assets/project_workload_assignment/js/assignment/dialog.js",
]

# include js, css files in header of web template
# web_include_css = "/assets/project_workload_assignment/css/project_workload_assignment.css"
# web_include_js = "/assets/project_workload_assignment/js/project_workload_assignment.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "project_workload_assignment/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {
                # dialog.js must precede form.js — form.js calls start_pwa_dialog()
                "Task": [
                    "public/js/assignment/dialog.js",
                    "public/js/assignment/form.js",
                ]
                ,"Issue": [
                    "public/js/assignment/dialog.js",
                    "public/js/assignment/form.js",
                ]
                # "Projects Workload Report" doctype_js intentionally omitted:
                # this is a custom DocType (is_custom=1), Frappe's add_code() skips
                # custom doctypes, so doctype_js entries have NO EFFECT here.
                # Scripts: workload-reports/report-form/entry.js (app_include_js).
                ,"Project":[
                    "public/js/core/form-tab.js",
                    "public/js/assignment/dialog.js",
                    "public/js/work_efforts/entry.js",
                    "public/js/forecast/pl-from-we.js",
                    "public/js/workload-reports/project-tab/entry.js",
                ]
            }

# CSS loads via entry.js frappe.require / app_include_css — not doctype_css
# (doctype_css is not a Frappe hook).

doctype_list_js = {
	"Task": [
		"public/js/assignment/dialog.js",
	],
}

doctype_tree_js = {
	"Task": [
		"public/js/assignment/dialog.js",
	],
}
# doctype_calendar_js = {"Task" : "public/js/assignment/dialog.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "project_workload_assignment/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "project_workload_assignment.utils.jinja_methods",
# 	"filters": "project_workload_assignment.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "project_workload_assignment.install.before_install"
after_install = "project_workload_assignment.install.after_install"
after_migrate = "project_workload_assignment.install.after_migrate"

# Uninstallation
# ------------

# before_uninstall = "project_workload_assignment.uninstall.before_uninstall"
# after_uninstall = "project_workload_assignment.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "project_workload_assignment.utils.before_app_install"
# after_app_install = "project_workload_assignment.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "project_workload_assignment.utils.before_app_uninstall"
# after_app_uninstall = "project_workload_assignment.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "project_workload_assignment.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"project_workload_assignment.tasks.all"
# 	],
# 	"daily": [
# 		"project_workload_assignment.tasks.daily"
# 	],
# 	"hourly": [
# 		"project_workload_assignment.tasks.hourly"
# 	],
# 	"weekly": [
# 		"project_workload_assignment.tasks.weekly"
# 	],
# 	"monthly": [
# 		"project_workload_assignment.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "project_workload_assignment.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "project_workload_assignment.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "project_workload_assignment.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["project_workload_assignment.utils.before_request"]
# after_request = ["project_workload_assignment.utils.after_request"]

# Job Events
# ----------
# before_job = ["project_workload_assignment.utils.before_job"]
# after_job = ["project_workload_assignment.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"project_workload_assignment.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

