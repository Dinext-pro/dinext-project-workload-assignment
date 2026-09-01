/** CSS spinner — gantt analog. Styles injected: Desk `--primary` is ink (#171717), not accent. */

const STYLE_ID = "wr-spinner-style";

const SPINNER_CSS = `
.wr-spinner {
	display: block;
	box-sizing: border-box;
	width: 28px;
	height: 28px;
	flex: 0 0 auto;
	border: 2px solid color-mix(in srgb, currentColor 28%, transparent);
	border-top-color: var(--blue-500, #2490ef);
	border-radius: 50%;
	animation: wr-spin 0.7s linear infinite;
}
@keyframes wr-spin {
	to { transform: rotate(360deg); }
}
`;

export function ensureSpinnerStyle() {
	if (document.getElementById(STYLE_ID)) return;
	const el = document.createElement("style");
	el.id = STYLE_ID;
	el.textContent = SPINNER_CSS;
	document.head.appendChild(el);
}

export function createSpinner(label) {
	ensureSpinnerStyle();
	const spin = document.createElement("div");
	spin.className = "wr-spinner";
	spin.setAttribute("role", "status");
	spin.setAttribute("aria-label", label || __("Loading…"));
	return spin;
}
