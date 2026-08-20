export type DictionarySearchEntry = {
  word: string;
  translation: string;
  definition: string;
  examples: readonly string[];
  related: readonly string[];
};

export const normalizeDictionarySearch = (value: string) => value
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .replace(/[’]/g, "'")
  .trim()
  .toLowerCase();

export function searchDictionary<T extends DictionarySearchEntry>(entries: readonly T[], query: string): T[] {
  const normalizedQuery = normalizeDictionarySearch(query);
  return entries.filter((entry) => normalizeDictionarySearch([
    entry.word,
    entry.translation,
    entry.definition,
    ...entry.examples,
    ...entry.related,
  ].join(" ")).includes(normalizedQuery));
}

export function findDictionaryEntry<T extends { word: string }>(entries: readonly T[], word: string): T | undefined {
  return entries.find((entry) => normalizeDictionarySearch(entry.word) === normalizeDictionarySearch(word));
}