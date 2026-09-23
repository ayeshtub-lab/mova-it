// Arabic changes the counted noun by number (1, 2, 3–10, 11–99, 100+), so counts are
// never "{n} + one fixed word". Each dictionary entry lists the forms per CLDR plural
// category (zero, one, two, few, many, other) and Intl.PluralRules picks the right one.
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export function plural(locale: string, forms: PluralForms, n: number) {
  const category = new Intl.PluralRules(locale).select(n);
  return (forms[category] ?? forms.other).replace("{n}", String(n));
}
