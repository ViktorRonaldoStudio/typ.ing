import type { Mode } from "./options.js"
import { pick, type RandomSource } from "./random.js"

const WORDS = [
  "about", "above", "across", "after", "again", "against", "almost", "along", "already", "always",
  "among", "another", "answer", "around", "because", "become", "before", "begin", "behind", "better",
  "between", "bring", "build", "change", "close", "common", "consider", "course", "create", "different",
  "during", "early", "earth", "enough", "every", "example", "family", "father", "feel", "follow",
  "found", "friend", "general", "great", "group", "grow", "happen", "health", "heart", "help",
  "however", "important", "include", "interest", "keep", "kind", "large", "later", "learn", "leave",
  "letter", "light", "little", "living", "long", "matter", "might", "money", "morning", "mother",
  "move", "music", "never", "night", "number", "often", "open", "order", "other", "people",
  "place", "point", "power", "problem", "program", "public", "question", "rather", "really", "right",
  "school", "second", "seem", "since", "small", "something", "sound", "start", "state", "still",
  "story", "study", "system", "their", "there", "these", "thing", "think", "those", "though",
  "through", "together", "under", "until", "water", "where", "which", "while", "without", "world",
  "would", "write", "young", "simple", "focus", "quick", "quiet", "smooth", "clear", "steady",
] as const

const QUOTES = [
  "The secret of getting ahead is getting started.",
  "Great things are done by a series of small things brought together.",
  "Simplicity is the soul of efficiency.",
  "It always seems impossible until it is done.",
  "The details are not the details; they make the design.",
  "You do not find the happy life. You make it.",
  "A year from now you may wish you had started today.",
  "What we think, we become.",
  "Do what you can, with what you have, where you are.",
  "Quality is not an act, it is a habit.",
  "The only way out is through.",
  "Make it work, make it right, make it fast.",
] as const

const CODE = [
  "const result = items.map((item) => item.value);",
  "if (ready && count > 0) return true;",
  "function add(a, b) { return a + b; }",
  "await Promise.all(tasks.map(run));",
  "type Status = 'idle' | 'busy' | 'done';",
  "for (const value of values) total += value;",
  "export default function main() { return 0; }",
  "const unique = [...new Set(values)];",
  "try { await save(data); } catch (error) { throw error; }",
  "interface User { id: string; active: boolean; }",
  "return input.trim().toLowerCase();",
  "const next = current ?? fallback;",
] as const

function createWords(characterTarget: number, random: RandomSource): string {
  const words: string[] = []
  let length = 0
  let previous = ""

  while (length < characterTarget) {
    let word = pick(WORDS, random)
    if (word === previous) word = pick(WORDS, random)
    words.push(word)
    previous = word
    length += word.length + 1
  }

  return words.join(" ")
}

function createPhrases(
  phrases: readonly string[],
  characterTarget: number,
  random: RandomSource,
): string {
  const output: string[] = []
  let length = 0
  let previous = ""

  while (length < characterTarget) {
    let phrase = pick(phrases, random)
    if (phrase === previous) phrase = pick(phrases, random)
    output.push(phrase)
    previous = phrase
    length += phrase.length + 1
  }

  return output.join(" ")
}

export function createContent(
  mode: Mode,
  random: RandomSource = Math.random,
  characterTarget = 5_000,
): string {
  if (mode === "words") return createWords(characterTarget, random)
  if (mode === "quotes") return createPhrases(QUOTES, characterTarget, random)
  return createPhrases(CODE, characterTarget, random)
}
