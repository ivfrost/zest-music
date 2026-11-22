/**
 * One shared ICU collator. `String.localeCompare` builds a collator for each call,
 * which costs hundreds of milliseconds on a few hundred names in Hermes.
 */
export const nameCollator = new Intl.Collator();
