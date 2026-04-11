/**
 * When merging form answers into friend.metadata, only allow keys that correspond
 * to defined form fields (prevents arbitrary metadata injection via crafted POST bodies).
 */
export function pickFormFieldValuesForMetadataMerge(
  submissionData: Record<string, unknown>,
  fields: Array<{ name: string }>,
): Record<string, unknown> {
  const allowed = new Set(fields.map((f) => f.name).filter((n) => n && n.length > 0));
  const out: Record<string, unknown> = {};
  for (const name of allowed) {
    if (Object.prototype.hasOwnProperty.call(submissionData, name)) {
      out[name] = submissionData[name];
    }
  }
  return out;
}
