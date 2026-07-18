# WE PWR Server Scripts: migration baseline

- scenario: `we_ss_migration_baseline`
- site: `dev.dinext.localhost` (или текущий `--site` bench)
- owner_app: `project_workload_assignment`
- dependent_apps:
  - `erpnext` (Project, Task, Fiscal Year)
  - `dinext_projects` (Project Role, Project Work Efforts)
  - `project_workload_assignment` (Project Workload Assignment)
- primary_surface: `Server Script` (API)
- secondary_surfaces:
  - `Python` (`project_report/overload_check` — `pwr_run_check_workload_overload`; tree via `project_report/single_project_workload_tree`)
- scenario_dir: `frappe-bench/apps/project_workload_assignment/project_workload_assignment/project_workload_assignment/tests/scenarios/we_ss_migration_baseline/`
- data_helper: `data_setup.py`
- source_of_truth:
  - `.sandbox/demodev/server-script/api/Сheck Workload Overload_V2.py` — `api_method` `check_workload_overload`
  - `.sandbox/demodev/server-script/api/Update Forecast From Assignments.py` — `api_method` `update_forecast_from_assignments`
- sync_required: `no` (TC-01/02 — Server Script на сайте; после disable SS на env — переключить TC на Python direct call, см. `data_setup_pwr.call_check_workload_overload_python`)
- run_targets:
  - `project_workload_assignment.project_workload_assignment.tests.scenarios.we_ss_migration_baseline.test_we_pwr_ss_baseline`
- Команда прогона (backend-контейнер):
  `docker exec dinext-frappe-local-backend-1 bench --site dev.dinext.localhost run-tests --app project_workload_assignment --module project_workload_assignment.project_workload_assignment.tests.scenarios.we_ss_migration_baseline.test_we_pwr_ss_baseline`
- actors:
  - setup_user: `Administrator`
  - business_user: `Administrator`
- runtime_inputs:
  - **TC-01**: dependency project `TEST-V15.106.0 (HEAD)` (не owned; должен существовать на сайте), фиксированные `periods` июнь–декабрь 2026, `view_options` «Прогноз и факт»
  - **TC-02**: owned документы с префиксом `WE-SS-MIG-PWR`; PWA 40 ч + PWE с `pwea_expected=10` на июнь 2026
- reset_scope:
  - **TC-01**: без reset (read-only dependency project)
  - **TC-02**: `Project`, `Task`, `Project Workload Assignment`, `Project Work Efforts` (owned tasks), `Project Role` с префиксом `WE-SS-MIG-PWR`

## Связь с ISS-2026-00002

На `dev.dinext.localhost` site CS/SS PWR отключены (миграция в app). См. `.issues/ISS-2026-00002/continuation.md`.

Python-пути (после reorg 2026-07-03):

- charts: `team_report/chart_aggregates.py`
- grid: `team_report/team_workload_grid.py`
- overload: `project_report/overload_check.py`
- forecast assignments: `forecast/forecast_from_assignments.py`

## Status Legend

- ⚪ не составлен runnable-артефакт
- 🟡 runnable есть, успешный прогон не зафиксирован
- 🟢 последний прогон успешен
- 🔴 последний прогон с падением

## Test Cases

- 🟡 TC-01: `check_workload_overload` golden comparison на `TEST-V15.106.0 (HEAD)` + фиксированные periods
  - surface: `Server Script` | actor: `business_user`
  - artifacts: `test_tc01_*`, `fixtures/tc01_check_workload_overload_golden.json`, `capture_golden_pwr.py`

- 🟡 TC-02: `update_forecast_from_assignments` на owned minimal PWA+PWE (narrow reset_scope)
  - surface: `Server Script` | actor: `business_user`
  - artifacts: `test_tc02_*`, `prepare_case_update_forecast_from_assignments`

## Primary test artifacts

- `test_we_pwr_ss_baseline.py` — TC-01, TC-02
- `data_setup.py` — owned setup/reset, helpers вызова Server Script API
- `capture_golden_pwr.py` — захват golden для TC-01
- `fixtures/tc01_check_workload_overload_golden.json` — эталон TC-01

## Capture golden (TC-01)

```bash
docker exec dinext-frappe-local-backend-1 bench --site dev.dinext.localhost execute \
  project_workload_assignment.project_workload_assignment.tests.scenarios.we_ss_migration_baseline.capture_golden_pwr.capture_tc01_golden
```

Или с хоста:

```bash
python .sandbox/local/scripts/capture_golden_pwr.py
```

## Side effects

- TC-01: read-only, dependency project не изменяется
- TC-02: `tearDown` удаляет owned документы; `update_forecast_from_assignments` меняет `pwea_expected` на owned PWE (восстанавливается reset)
