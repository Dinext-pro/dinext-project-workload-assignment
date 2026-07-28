# Copyright (c) 2026, Dinext
"""PWR — расчёт загрузки команды/проекта (PWA).

Структура:
- models.py — TypedDict form/response для PWR API
- core/ — периоды, окна, движок, контекст, назначения
- team_report/ — отчёт загрузки команды и графики
- project_report/ — дерево загрузки проекта, overload, прогноз по задачам
- utilization/ — утилизация и факт UTP (сервис для reports/charts)
- canonical/ — reshape legacy wire → DinextTable GridResponse

Соседние пакеты (не здесь):
- work_efforts/ — PWE grid
- forecast/ — PWE/PWA → P&L

Ops (FormMeta / disable CS): `.sandbox/local/scripts/pwr_*.py`
"""
