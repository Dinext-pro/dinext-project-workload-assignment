# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

from frappe.model.document import Document

from project_workload_assignment.pwa_dates.validation import validate_assignment


class ProjectWorkloadAssignment(Document):
	def validate(self):
		validate_assignment(self)
