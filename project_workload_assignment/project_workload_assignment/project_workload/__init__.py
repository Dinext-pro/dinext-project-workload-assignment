# Copyright (c) 2026, Dinext
"""Модули расчёта Project Workload (отчёт PWR, таб проекта, PWE).

Структура:
- core/ — периоды, окна, движок, контекст, назначения
- team_report/ — общий отчёт загрузки команды и графики
- project_report/ — дерево загрузки проекта, overload, прогноз по задачам
- utilization/ — утилизация и факт UTP
- forecast/ — P&L-прогноз из PWE и обновление из PWA
- work_efforts/ — consolidated data, limits, save plan
- ops/ — миграция CS/SS, sandbox_cs, refresh form meta
"""
