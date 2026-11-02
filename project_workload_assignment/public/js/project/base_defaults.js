/**
 * ISS-2026-03483: пустой Select базы на Project → показать site default из boot.
 *
 * Контракт:
 * - пустое в БД = «взять site default» (см. normalize_* / site_default_* в workload_base.py)
 * - UI не должен выглядеть как «ничего не выбрано»
 * - default сайта: frappe.boot.limits_default_base / workload_default_base
 *   (client_config; нет ключа → «От плана»)
 *
 * Без frm.set_value: не dirty и не remount вкладки Загрузка.
 * onload_post_render: к этому моменту у Select уже есть input (в отличие от раннего refresh).
 */
(function () {
	const PLAN = "От плана";
	const FORECAST = "От прогноза";
	const ALLOWED = new Set([PLAN, FORECAST]);

	function resolveBootBase(bootKey) {
		const raw = String((frappe.boot && frappe.boot[bootKey]) || "").trim();
		if (ALLOWED.has(raw)) {
			return raw;
		}
		const key = raw.toLowerCase();
		if (key === "plan" || key === "from plan" || key === "от плана") {
			return PLAN;
		}
		if (key === "forecast" || key === "from forecast" || key === "от прогноза") {
			return FORECAST;
		}
		return PLAN;
	}

	function showSiteDefaultIfEmpty(frm, fieldname, bootKey) {
		if (!frm || !frm.doc) {
			return;
		}
		if (String(frm.doc[fieldname] || "").trim()) {
			return;
		}
		const field = frm.get_field(fieldname);
		if (!field || typeof field.set_input !== "function") {
			return;
		}
		const value = resolveBootBase(bootKey);
		frm.doc[fieldname] = value;
		field.set_input(value);
	}

	function apply(frm) {
		showSiteDefaultIfEmpty(frm, "custom_limits_base", "limits_default_base");
		showSiteDefaultIfEmpty(frm, "custom_workload_base", "workload_default_base");
	}

	frappe.ui.form.on("Project", {
		onload_post_render(frm) {
			apply(frm);
		},
		refresh(frm) {
			// reload / discard: снова пустое из БД
			apply(frm);
		},
	});
})();
