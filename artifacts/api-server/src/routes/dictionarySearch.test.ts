import assert from "node:assert/strict";
import test from "node:test";
import { findDictionaryEntry, searchDictionary } from "./dictionarySearch";

const entries = [
  {
    word: "lundi",
    translation: "Monday",
    definition: "The first day of the working week.",
    examples: ["Lundi, je travaille."],
    related: ["mardi"],
  },
  {
    word: "français",
    translation: "French",
    definition: "The French language or something from France.",
    examples: ["J'apprends le français."],
    related: ["langue"],
  },
] as const;

test("dictionary search finds common words and ignores accents", () => {
  assert.deepEqual(searchDictionary(entries, "lundi").map((entry) => entry.word), ["lundi"]);
  assert.deepEqual(searchDictionary(entries, "francais").map((entry) => entry.word), ["français"]);
  assert.equal(findDictionaryEntry(entries, "francais")?.word, "français");
});

test("dictionary search returns no entries for an unknown word", () => {
  assert.deepEqual(searchDictionary(entries, "flibbertigibbet"), []);
});