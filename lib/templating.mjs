/**
 * Template variable substitution engine for harness sync.
 *
 * Applies `{{key}}` → value substitutions to template content per the
 * consumer's `harness.config.json` → `templating` map.
 *
 * @module lib/templating.mjs
 */

/**
 * Apply `{{key}}` substitutions from a variable map to template content.
 *
 * Substitution is lenient: any `{{key}}` placeholder whose key is NOT present
 * in the variable map is left unchanged in the output (pass-through). This
 * allows templates that are only partially configured and avoids silent data
 * loss on unknown placeholders.
 *
 * Only string values are substituted; non-string values in the map are skipped.
 *
 * @param {string} content - Template content with `{{key}}` placeholders.
 * @param {Record<string, string>} [variables] - Key→value substitution map
 *   (config.templating). Missing or null is treated as an empty map.
 * @returns {string} Content with all recognised substitutions applied.
 */
export function applyTemplating(content, variables) {
  if (!variables || typeof variables !== 'object') return content;
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    if (typeof value !== 'string') continue;
    result = result.split(`{{${key}}}`).join(value);
  }
  return result;
}
