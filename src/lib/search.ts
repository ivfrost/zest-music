/** Latin letters whose accent is a stroke or ligature, not a combining mark. */
const LATIN_FOLDS: Record<string, string> = {
  ł: 'l',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ı: 'i',
  ħ: 'h',
};

/** Cyrillic to Latin, so Latin typing finds Cyrillic names and the reverse. */
const CYRILLIC_FOLDS: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  і: 'i',
  ї: 'i',
  є: 'e',
  ґ: 'g',
  ў: 'u',
};

/**
 * Folds text for search: case, accents, stroke letters and Cyrillic all collapse to
 * a comparable Latin form, so `lodz` matches `Łódź` and `kino` matches `Кино`.
 */
export function foldForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[łøđðþßæœıħ]/g, char => LATIN_FOLDS[char] ?? char)
    .replace(/[\u0400-\u04ff]/g, char => CYRILLIC_FOLDS[char] ?? char);
}
