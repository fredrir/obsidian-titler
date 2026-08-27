import type { TemplateValues } from "../types";

export const DEFAULT_TEMPLATE = "{{title}}";
export const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";

const TOKEN = /\{\{\s*(title|parent|date)(?::([^}]*))?\s*\}\}/g;
const TITLE_TOKEN = /\{\{\s*title\s*\}\}/;

/**
 * A template with no `{{title}}` renders the same name whatever the note says,
 * so it is applied once at creation and the note is then left alone.
 */
export function isStaticTemplate(template: string): boolean {
	return !TITLE_TOKEN.test(template);
}

/** Replaces `{{title}}`, `{{parent}}` and `{{date:FORMAT}}`; leaves the rest alone. */
export function applyTemplate(template: string, values: TemplateValues): string {
	const source = template || DEFAULT_TEMPLATE;
	return source.replace(
		TOKEN,
		(match, token: string, format?: string) => renderToken(token, format, values) ?? match,
	);
}

function renderToken(token: string, format: string | undefined, values: TemplateValues): string | null {
	switch (token) {
		case "title":
			return values.title;
		case "parent":
			return values.parent;
		case "date":
			return values.formatDate(format?.trim() || DEFAULT_DATE_FORMAT);
		default:
			return null;
	}
}
