import a11y from 'eslint-plugin-jsx-a11y';

/**
 * The accessibility rules every app enforces (2026-09-10).
 *
 * Shared because otherwise the four apps drift: a rule tightened in the POS
 * and forgotten in the admin is worse than no rule, since it makes the lint
 * output look like a guarantee it isn't.
 *
 * Everything starts from the plugin's own recommended set, as errors. That was
 * measured before it was switched on — twenty-five of those rules were already
 * clean in all four apps, and the handful that were not are listed below with
 * their counts. Nothing here is aspirational; a fresh clone lints green.
 *
 * Run `node scripts/a11y-count.mjs` to re-measure. It ignores these settings
 * and runs every rule the plugin has, so the numbers in the comments below can
 * be checked rather than taken on trust.
 */
export const a11yPlugin = a11y;

export const a11yRules = {
  ...a11y.flatConfigs.recommended.rules,

  /*
   * One family, 134 violations: an element that answers a click but not a key
   * press. Real — a cashier who has lost the mouse, or anyone driving the
   * admin from a keyboard, cannot use these at all. Warn rather than error
   * because fixing them is a job of its own, and a rule that blocks every
   * unrelated commit gets switched off rather than obeyed.
   *
   *   click-events-have-key-events            57
   *   no-static-element-interactions          40
   *   no-noninteractive-element-interactions  37
   */
  'jsx-a11y/click-events-have-key-events': 'warn',
  'jsx-a11y/no-static-element-interactions': 'warn',
  'jsx-a11y/no-noninteractive-element-interactions': 'warn',

  /*
   * 240 violations: labels that are near an input rather than attached to it.
   * A screen reader reads the field as unlabelled, and tapping the label on a
   * phone does not focus the box. Worth doing, but it is a pass over every
   * form in the estate, not something to discover mid-commit — and 240
   * warnings would bury the ones above. Off, with the number on the record.
   */
  'jsx-a11y/label-has-associated-control': 'off',

  /*
   * 28 violations, all deliberate. The POS focuses the barcode field on open
   * so a scanner works without a click first, and the search sheets do the
   * same. Autofocus is the right call on a screen that exists to be typed
   * into immediately.
   */
  'jsx-a11y/no-autofocus': 'off',
};
