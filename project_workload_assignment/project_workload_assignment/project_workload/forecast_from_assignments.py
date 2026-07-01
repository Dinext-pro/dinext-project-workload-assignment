# Copyright (c) 2026, Dinext
"""Update Forecast From Assignments — ported from Server Script (ISS-2025-01239).

Обновляет pwea_expected в Project Work Efforts по переданным назначениям PWA
и рекурсивно пересчитывает прогнозы родительских задач.
Entrypoint: run_update_forecast_from_assignments(form_dict) -> dict
"""

import json

import frappe


ENABLE_DETAILED_LOG = False


def _debug_log(message):
	if ENABLE_DETAILED_LOG:
		frappe.log(message)


def _get_children_forecast_sum(parent_task_id, child_role, child_year, child_month, child_project):
	"""Вычисляет сумму прогнозов всех дочерних задач."""
	total_sum = 0.0
	child_tasks = frappe.db.get_all(
		"Task",
		filters={"parent_task": parent_task_id},
		fields=["name"],
	)

	for child in child_tasks:
		child_pwe = frappe.db.get_value(
			"Project Work Efforts",
			{
				"pwe_project": child_project,
				"pwe_task": child.name,
				"pwe_project_role": child_role,
			},
			"name",
		)

		if child_pwe:
			child_doc = frappe.get_doc("Project Work Efforts", child_pwe)
			for amount_row in child_doc.pwe_amount:
				if (
					int(amount_row.pwea_year) == child_year
					and int(amount_row.pwea_month) == child_month
				):
					child_value = float(amount_row.pwea_expected or 0)
					if child_value > 0:
						total_sum += child_value
						_debug_log(f"      Дочерняя {child.name}: {child_value}")
					break
		else:
			descendants_sum = _get_children_forecast_sum(
				child.name, child_role, child_year, child_month, child_project
			)
			if descendants_sum > 0:
				total_sum += descendants_sum

	return total_sum


def _update_parent_forecast(task_id, role, year, month, new_child_value, project):
	"""Рекурсивно обновляет прогноз родительских задач."""
	_debug_log(f"  update_parent_forecast: task={task_id}, role={role}, {year}-{month}, value={new_child_value}")

	parent_task = frappe.db.get_value("Task", task_id, "parent_task")

	if not parent_task:
		return

	_debug_log(f"  Родительская задача: {parent_task}")

	PWE = frappe.qb.DocType('Project Work Efforts')
	result = (
		frappe.qb.from_(PWE)
		.select(PWE.name)
		.where(PWE.pwe_project == project)
		.where(PWE.pwe_task == parent_task)
		.where(PWE.pwe_project_role == role)
		.limit(1)
	).run(as_dict=True)

	if result:
		pwe_name = result[0].get('name')
		parent_doc = frappe.get_doc("Project Work Efforts", pwe_name)
		_debug_log(f"  Найден PWE родителя: {pwe_name}")
	else:
		parent_doc = frappe.new_doc("Project Work Efforts")
		parent_doc.pwe_project = project
		parent_doc.pwe_task = parent_task
		parent_doc.pwe_project_role = role
		parent_doc.insert()
		_debug_log(f"  Создан новый PWE для родителя: {parent_doc.name}")

	children_sum = _get_children_forecast_sum(parent_task, role, year, month, project)
	_debug_log(f"  Сумма дочерних задач: {children_sum}")

	current_parent_value = 0.0
	found_row = None

	for row in parent_doc.pwe_amount:
		if int(row.pwea_year) == year and int(row.pwea_month) == month:
			current_parent_value = float(row.pwea_expected or 0)
			found_row = row
			break

	if children_sum > current_parent_value:
		if found_row:
			found_row.pwea_expected = children_sum
		else:
			parent_doc.append('pwe_amount', {
				'pwea_year': year,
				'pwea_month': month,
				'pwea_expected': children_sum
			})

		parent_doc.save()
		_debug_log(f"  Родитель {parent_task} обновлен: {current_parent_value} -> {children_sum}")

		_update_parent_forecast(parent_task, role, year, month, children_sum, project)
	else:
		_debug_log(f"  Сумма детей ({children_sum}) <= родитель ({current_parent_value}), без изменений")


def run_update_forecast_from_assignments(fd) -> dict:
	"""Обновляет pwea_expected по назначениям и рекурсивно обновляет родительские PWE."""
	if fd is None:
		fd = {}
	if not isinstance(fd, frappe._dict):
		fd = frappe._dict(fd)

	project = fd.get('project')
	updates_json = fd.get('updates_json', '[]')

	if isinstance(updates_json, str):
		updates = json.loads(updates_json)
	else:
		updates = list(updates_json)

	frappe.log(f"update_forecast_from_assignments: project={project}, updates count={len(updates)}")
	_debug_log("=== STEP 1: PARAMETERS ===")

	if not project:
		return {
			'success': False,
			'updated_count': 0,
			'error': 'No project specified'
		}

	if not updates:
		return {
			'success': False,
			'updated_count': 0,
			'error': 'No updates provided'
		}

	updated_count = 0
	errors = []

	for idx, item in enumerate(updates):
		_debug_log(f"\n=== PROCESSING ITEM {idx+1} ===")

		task = item.get('task')
		role = item.get('role')
		year = item.get('year')
		month = item.get('month')
		assigned_hours = item.get('assigned_hours', 0)

		if not task or not role or not year or not month:
			_debug_log(f"  SKIP: missing required fields")
			errors.append(f"Missing fields in item {idx+1}")
			continue

		year = int(year)
		month = int(month)

		PWE = frappe.qb.DocType('Project Work Efforts')
		result = (
			frappe.qb.from_(PWE)
			.select(PWE.name)
			.where(PWE.pwe_project == project)
			.where(PWE.pwe_task == task)
			.where(PWE.pwe_project_role == role)
			.limit(1)
		).run(as_dict=True)

		if result:
			pwe_name = result[0].get('name')
			_debug_log(f"Found existing PWE: {pwe_name}")
			doc = frappe.get_doc("Project Work Efforts", pwe_name)
		else:
			_debug_log(f"No existing PWE found, creating new one")
			doc = frappe.new_doc("Project Work Efforts")
			doc.pwe_project = project
			doc.pwe_task = task
			doc.pwe_project_role = role
			doc.insert()
			_debug_log(f"Created new PWE: {doc.name}")

		found = False
		for row in doc.pwe_amount:
			if int(row.pwea_year) == year and int(row.pwea_month) == month:
				row.pwea_expected = assigned_hours
				found = True
				break

		if not found:
			doc.append('pwe_amount', {
				'pwea_year': year,
				'pwea_month': month,
				'pwea_expected': assigned_hours
			})

		doc.save()
		updated_count += 1
		_debug_log(f"Document saved successfully")

		_update_parent_forecast(task, role, year, month, assigned_hours, project)

	frappe.log(f"Update completed: {updated_count} updated, {len(errors)} errors")

	return {
		'success': True,
		'updated_count': updated_count,
		'errors': errors
	}
