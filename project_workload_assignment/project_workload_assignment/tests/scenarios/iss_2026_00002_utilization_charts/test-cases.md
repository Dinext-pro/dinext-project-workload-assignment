# PWR: серии утилизации на графике команды (ISS-2026-00002)

- issue: ISS-2026-00002
- site: `dev.dinext.localhost`
- owner_app: `project_workload_assignment`
- dependent_apps:
  - `erpnext` (Project, Task)
  - `dinext_projects` (Worker, Worker Utilization Table, Project Utilization Table)
  - `project_workload_assignment` (Project Workload Assignment)
- primary_surface: `Python` (`chart_aggregates.run_get_team_workload_charts`)
- secondary_surfaces:
  - `Client Script` (кнопка «Добавить утилизацию» — smoke вне этого модуля)
- scenario_dir: `project_workload_assignment/project_workload_assignment/tests/scenarios/iss_2026_00002_utilization_charts/`
- data_helper: `data_setup.py`
- source_of_truth:
  - `utilization_helpers.py` — eligibility (Employee, wvalid, util%, pu_included)
  - `utilization_forecast.py` — прогноз утилизации (не sum stacked)
  - `utilization_plan.py` — план утилизации
  - `chart_aggregates.py` — wiring series при `load_utilization=1`
- sync_required: `no`
- run_targets:
  - `project_workload_assignment.project_workload_assignment.tests.scenarios.iss_2026_00002_utilization_charts.test_utilization_charts`
- actors:
  - setup_user: `Administrator`
  - business_user: `Administrator` (вызов chart API)
- runtime_inputs:
  - `frappe.utils.nowdate()` → `patch(nowdate → WEEK_START)` (SQL lower bound назначений)
  - `period_anchor_date` = `2026-06-01`, `view_type` = `weekly`, `load_utilization` = `1`
  - `user_group` сценария — узкий scope на трёх тестовых пользователей
  - PWA «В рабочих часах»: A→COMM 40 ч, A→INT 20 ч, C→COMM 30 ч
- reset_scope:
  - `Project`, `Task`, `PWA`, `Worker`, `User` (3 email), `User Group`, `Project Role` с префиксом `ISS-2026-00002-UTIL`

## Test Cases

| ID | Описание | Ожидание |
| --- | --- | --- |
| TC-01 | Прогноз утилизации | ≈ 40 ч (только A→COMM с pu=Да), не 90 ч |
| TC-02 | План утилизации по user | A > 0; B (без util%) и C (Supplier) = 0 |
| TC-03 | Stacked workload | Employee 60 + Supplier 30 ≈ 90 ч |
| TC-04 | wvalid вне периода | util plan/forecast = 0; stacked ≈ 90 ч |

## Команда прогона

```bash
docker exec "dinext-frappe-local-backend-1" bench --site dev.dinext.localhost run-tests --app project_workload_assignment --module project_workload_assignment.project_workload_assignment.tests.scenarios.iss_2026_00002_utilization_charts.test_utilization_charts
```

## Примечание

Сценарий проверяет целевое поведение после этапов 3–4 (`utilization_forecast.py`, фильтрация в `utilization_plan.py`). На `dev.dinext.localhost` — 4/4 OK (2026-06-30).
