import type { Language, Mode } from "./options.js"
import { pick, type RandomSource } from "./random.js"

const WORDS: Record<"en" | "fr" | "de" | "es", readonly string[]> = {
  en: [
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
  ],
  fr: [
    "alors", "année", "après", "assez", "aujourd'hui", "aussi", "autour", "autre", "avant", "avec",
    "avoir", "beaucoup", "besoin", "bien", "bonjour", "chaque", "chose", "comme", "comment", "contre",
    "dans", "depuis", "deux", "devoir", "dire", "donner", "encore", "enfant", "entre", "être",
    "faire", "famille", "femme", "fois", "grand", "heure", "homme", "ici", "jamais", "jour",
    "laisser", "longtemps", "maison", "maintenant", "mais", "même", "monde", "nouveau", "parce", "parler",
    "partir", "passer", "pendant", "penser", "petit", "peut", "plus", "prendre", "premier", "quand",
    "quelque", "rien", "savoir", "seul", "temps", "tenir", "toujours", "trouver", "venir", "vivre",
  ],
  de: [
    "aber", "alle", "also", "andere", "auch", "auf", "aus", "bei", "beide", "bereits", "besser",
    "bleiben", "bringen", "dabei", "dafür", "dann", "denken", "durch", "eigentlich", "einfach", "einige",
    "erst", "etwas", "finden", "fragen", "geben", "gehen", "gehören", "genau", "gerade", "groß",
    "haben", "heute", "hier", "immer", "jetzt", "kommen", "können", "lassen", "leben", "machen",
    "mehr", "müssen", "nach", "nehmen", "noch", "oder", "schon", "sehen", "sehr", "sein",
    "seit", "selbst", "sollen", "stehen", "über", "vielleicht", "weiter", "werden", "wieder", "wissen",
    "wollen", "zwischen", "zusammen", "zurück", "Familie", "Freund", "Morgen", "Wasser", "Welt", "Zeit",
  ],
  es: [
    "ahora", "algo", "antes", "aquí", "aunque", "bien", "cada", "casa", "como", "cuando",
    "decir", "desde", "después", "donde", "durante", "encontrar", "entonces", "entre", "estar", "familia",
    "forma", "grande", "hacer", "hasta", "hombre", "importante", "llegar", "llevar", "lugar", "manera",
    "mejor", "mientras", "mismo", "mundo", "mujer", "nada", "necesitar", "noche", "nuevo", "nunca",
    "otro", "parecer", "parte", "pasar", "pequeño", "pensar", "persona", "poder", "porque", "primero",
    "querer", "saber", "seguir", "siempre", "sobre", "también", "tener", "tiempo", "trabajo", "vida",
  ],
}

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

const CODE: Record<"javascript" | "typescript" | "python" | "rust" | "go", readonly string[]> = {
  javascript: [
    "const result = items.map((item) => item.value);",
    "if (ready && count > 0) return true;",
    "async function load() { return await fetch(url); }",
    "const unique = [...new Set(values)];",
    "return input.trim().toLowerCase();",
  ],
  typescript: [
    "type Status = 'idle' | 'busy' | 'done';",
    "interface User { id: string; active: boolean; }",
    "function first<T>(items: T[]): T | undefined { return items[0]; }",
    "const next: Result = current ?? fallback;",
    "export async function save(data: Data): Promise<void> { await store.write(data); }",
  ],
  python: [
    "def greet(name: str) -> str: return f\"Hello, {name}!\"",
    "values = [item.value for item in items if item.active]",
    "for index, value in enumerate(values): print(index, value)",
    "result = await client.fetch(url, timeout=10)",
    "with open(path, encoding=\"utf-8\") as file: text = file.read()",
  ],
  rust: [
    "fn add(left: i32, right: i32) -> i32 { left + right }",
    "let values: Vec<_> = items.iter().map(|item| item.value).collect();",
    "match result { Ok(value) => value, Err(error) => return Err(error) }",
    "for value in values.iter().filter(|value| value.active) { process(value); }",
    "pub struct User { id: String, active: bool }",
  ],
  go: [
    "func add(left int, right int) int { return left + right }",
    "for index, value := range values { fmt.Println(index, value) }",
    "if err != nil { return fmt.Errorf(\"load: %w\", err) }",
    "type User struct { ID string; Active bool }",
    "result, err := client.Fetch(ctx, url)",
  ],
}

const SYMBOL_GROUPS = [
  "! @ # $ % ^ & *", "( ) [ ] { }", "< > / \\ |", "+ - = _ ~", ": ; ' \" `", "? . , !",
] as const

function createSequence(items: readonly string[], characterTarget: number, random: RandomSource): string {
  const output: string[] = []
  let length = 0
  let previous = ""
  while (length < characterTarget) {
    let item = pick(items, random)
    if (item === previous && items.length > 1) item = pick(items, random)
    output.push(item)
    previous = item
    length += item.length + 1
  }
  return output.join(" ")
}

function createNumbers(characterTarget: number, random: RandomSource): string {
  const output: string[] = []
  let length = 0
  while (length < characterTarget) {
    const kind = Math.floor(random() * 5)
    const value = Math.floor(random() * 100_000)
    const token = kind === 0 ? String(value)
      : kind === 1 ? `${value % 100}.${String(value % 100).padStart(2, "0")}`
      : kind === 2 ? `${value % 101}%`
      : kind === 3 ? `${2000 + (value % 50)}-${String(1 + (value % 12)).padStart(2, "0")}-${String(1 + (value % 28)).padStart(2, "0")}`
      : `${1 + (value % 999)}:${String(value % 60).padStart(2, "0")}`
    output.push(token)
    length += token.length + 1
  }
  return output.join(" ")
}

function wordLanguage(language?: Language): keyof typeof WORDS {
  return language === "fr" || language === "de" || language === "es" ? language : "en"
}

function codeLanguage(language?: Language): keyof typeof CODE {
  if (language === "javascript" || language === "python" || language === "rust" || language === "go") return language
  return "typescript"
}

export function createPhraseContent(
  phrases: readonly string[],
  random: RandomSource = Math.random,
  characterTarget = 5_000,
): string {
  if (phrases.length === 0) throw new Error("No practice text is available")
  return createSequence(phrases, characterTarget, random)
}

export function createContent(
  mode: Mode,
  random: RandomSource = Math.random,
  characterTarget = 5_000,
  language?: Language,
): string {
  if (mode === "words") return createSequence(WORDS[wordLanguage(language)], characterTarget, random)
  if (mode === "quotes") return createSequence(QUOTES, characterTarget, random)
  if (mode === "code") return createSequence(CODE[codeLanguage(language)], characterTarget, random)
  if (mode === "numbers") return createNumbers(characterTarget, random)
  if (mode === "symbols") return createSequence(SYMBOL_GROUPS, characterTarget, random)
  throw new Error(`${mode} content must be loaded before starting the trainer`)
}
