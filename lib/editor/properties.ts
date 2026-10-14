// Checks for org custom property values, shared by the form and the server. GitHub's limits: a
// value is at most 75 characters; a single select must be one of its allowed values; a required
// property cannot be unset.

export type PropertyRule = { name: string; type: string; required: boolean; allowed: string[] };

/** The property types the editor can set. A multi select is shown, not edited. */
export function isEditableType(type: string): boolean {
  return type === "string" || type === "single_select" || type === "true_false" || type === "url";
}

export function checkPropertyValue(rule: PropertyRule, value: string | null): string | undefined {
  if (!isEditableType(rule.type)) return `${rule.name} is a ${rule.type.replace("_", " ")}; change it on GitHub`;
  if (value === null || value === "") return rule.required ? `${rule.name} is required and cannot be unset` : undefined;
  if (value.length > 75) return `${rule.name}: at most 75 characters`;
  if (rule.type === "single_select" && !rule.allowed.includes(value)) return `${rule.name}: ${value} is not one of ${rule.allowed.join(", ")}`;
  if (rule.type === "true_false" && value !== "true" && value !== "false") return `${rule.name}: must be true or false`;
  if (rule.type === "url" && !/^https?:\/\/\S+$/.test(value)) return `${rule.name}: must be an http or https link`;
  return undefined;
}
