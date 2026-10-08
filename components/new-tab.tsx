/**
 * Every link that leaves the dashboard opens in a new tab, so the page a reader is scanning stays
 * put; `noopener` keeps the opened page from reaching back to this one. Page links inside the
 * dashboard stay in the same tab (the back button must keep working). Spread it on an `<a>` whose
 * href is decided at render time; the anchors with a fixed outside href carry the same two
 * attributes inline.
 */
export const newTab = { target: "_blank", rel: "noopener noreferrer" } as const;
