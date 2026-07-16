# Copyright (c) 2026, Dinext
"""Port of Server Script «Save_Forecast_As_Plan».

ISS-2025-01239: миграция из Server Script в Python-модуль.
API method: save_forecast_as_plan

Тикет: https://erp.dinord.ru/app/issue/ISS-2025-02058
"""

from __future__ import annotations

import json

import frappe

from project_workload_assignment.project_workload_assignment.work_efforts.models import (
    SaveForecastAsPlanFormInput,
    SaveForecastAsPlanItem,
)


def run_save_forecast_as_plan(form_dict: SaveForecastAsPlanFormInput) -> int:
    project = form_dict.get("project")
    data = form_dict.get("data", "[]")

    if (
        not data
        or not data.strip()
        or not data.strip().startswith("[")
        or not data.strip().endswith("]")
    ):
        frappe.throw("Неверный формат данных")
        return 0

    data_list: list[SaveForecastAsPlanItem] = json.loads(data)
    processed_count = 0

    for item in data_list:
        task = item.get("task") or ""
        role = item.get("role") or ""
        year_str = str(item.get("year", ""))
        month_str = str(item.get("month", ""))
        plan_value_str = str(item.get("plan_value", "0"))

        if not task or not year_str or not month_str:
            continue

        year_valid = year_str.isdigit()
        month_valid = month_str.isdigit()
        plan_value_valid = plan_value_str.replace(".", "", 1).isdigit()

        if not year_valid or not month_valid or not plan_value_valid:
            continue

        year = int(year_str)
        month = int(month_str)
        plan_value = float(plan_value_str)

        if not frappe.db.exists("Task", task):
            continue

        if role and str(role).strip() != "":
            if not frappe.db.exists("Project Role", role):
                role = None
        else:
            role = None

        filters: dict[str, object] = {"pwe_project": project, "pwe_task": task}
        if role:
            filters["pwe_project_role"] = role
        else:
            filters["pwe_project_role"] = ["is", "not set"]

        pwe_name = frappe.db.get_value("Project Work Efforts", filters)

        if pwe_name:
            pwe_doc = frappe.get_doc("Project Work Efforts", pwe_name)
        else:
            pwe_doc = frappe.new_doc("Project Work Efforts")
            pwe_doc.pwe_project = project
            pwe_doc.pwe_task = task
            if role:
                pwe_doc.pwe_project_role = role
            pwe_doc.insert()

        existing_row = None
        for row in pwe_doc.pwe_amount:
            if int(row.pwea_year) == year and int(row.pwea_month) == month:
                existing_row = row
                break

        if existing_row:
            existing_row.pwea_plan = plan_value
        else:
            pwe_doc.append(
                "pwe_amount",
                {
                    "pwea_year": year,
                    "pwea_month": month,
                    "pwea_plan": plan_value,
                    "pwea_expected": 0,
                },
            )

        pwe_doc.save()
        processed_count += 1

    return processed_count
