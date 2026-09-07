/** Temporary mount/boot tracing — filter console by WR-DEBUG */
export function wrDebug(surface, event, data) {
	const msg = `[WR-DEBUG:${surface}] ${event}`;
	if (data === undefined) {
		console.log(msg);
		return;
	}
	console.log(msg, data);
}

export function wrFieldSnapshot(frm, fieldname) {
	const field = frm?.get_field?.(fieldname);
	if (!field) {
		return {
			fieldname,
			exists: false,
			inFieldsDict: !!frm?.fields_dict?.[fieldname],
		};
	}
	const el = field.$wrapper?.get?.(0);
	const control = el?.closest?.(".frappe-control") || el;
	let controlDisplay = null;
	if (control && typeof getComputedStyle === "function") {
		controlDisplay = getComputedStyle(control).display;
	}
	return {
		fieldname,
		exists: true,
		dfHidden: field.df?.hidden,
		dfFieldtype: field.df?.fieldtype,
		dfPermlevel: field.df?.permlevel,
		hasWrapper: !!field.$wrapper?.length,
		wrapperVisible: field.$wrapper?.is?.(":visible"),
		controlHasHideClass: !!control?.classList?.contains("hide-control"),
		controlDisplay,
		hasWrRoot:
			!!el?.classList?.contains("workload-reports-root") ||
			!!el?.querySelector?.(".workload-reports-root"),
		inDom: !!(el && document.contains(el)),
	};
}
