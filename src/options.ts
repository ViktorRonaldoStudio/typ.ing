export const VERSION = "0.4.0"

export const MODES = ["words", "quotes", "code", "numbers", "symbols", "readwise", "custom"] as const
export type Mode = (typeof MODES)[number]

export const LANGUAGES = ["en", "fr", "de", "es", "javascript", "typescript", "python", "rust", "go"] as const
export type Language = (typeof LANGUAGES)[number]
export type Command = "train" | "login" | "logout" | "whoami"

export const PRESET_DURATIONS = [15, 30, 60, 120] as const

export interface CliOptions {
  command: Command
  durationSeconds: number
  mode: Mode
  language?: Language
  file?: string
  text?: string
  seed?: number
  startInNavigation: boolean
  help: boolean
  version: boolean
}

export class OptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OptionError"
  }
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith("-")) {
    throw new OptionError(`${flag} needs a value`)
  }
  return value
}

export function parseOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    command: "train",
    durationSeconds: 30,
    mode: "words",
    startInNavigation: true,
    help: false,
    version: false,
  }

  const first = args[0]
  if (first === "login" || first === "logout" || first === "whoami") {
    options.command = first
    args = args.slice(1)
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]

    if (argument === "--help" || argument === "-h") {
      options.help = true
      continue
    }

    if (argument === "--version" || argument === "-v") {
      options.version = true
      continue
    }

    if (argument === "--time" || argument === "-t") {
      const raw = readValue(args, index, argument)
      const seconds = Number(raw)
      if (!Number.isInteger(seconds) || seconds < 5 || seconds > 300) {
        throw new OptionError("--time must be a whole number from 5 to 300")
      }
      options.durationSeconds = seconds
      index += 1
      continue
    }

    if (argument === "--mode" || argument === "-m") {
      const mode = readValue(args, index, argument)
      if (!MODES.includes(mode as Mode)) {
        throw new OptionError(`--mode must be one of: ${MODES.join(", ")}`)
      }
      options.mode = mode as Mode
      options.startInNavigation = false
      index += 1
      continue
    }

    if (argument === "--language" || argument === "-l") {
      const language = readValue(args, index, argument)
      if (!LANGUAGES.includes(language as Language)) {
        throw new OptionError(`--language must be one of: ${LANGUAGES.join(", ")}`)
      }
      options.language = language as Language
      options.startInNavigation = false
      index += 1
      continue
    }

    if (argument === "--file") {
      options.file = readValue(args, index, argument)
      options.mode = "custom"
      options.startInNavigation = false
      index += 1
      continue
    }

    if (argument === "--text") {
      options.text = readValue(args, index, argument)
      options.mode = "custom"
      options.startInNavigation = false
      index += 1
      continue
    }

    if (argument === "--seed") {
      const raw = readValue(args, index, argument)
      const seed = Number(raw)
      if (!Number.isInteger(seed)) {
        throw new OptionError("--seed must be a whole number")
      }
      options.seed = seed
      index += 1
      continue
    }

    throw new OptionError(`Unknown option: ${argument}`)
  }

  if (options.file && options.text) {
    throw new OptionError("Use either --file or --text, not both")
  }
  if (options.mode === "custom" && !options.file && !options.text) {
    throw new OptionError("custom mode needs --file or --text")
  }

  const wordLanguages: readonly Language[] = ["en", "fr", "de", "es"]
  const codeLanguages: readonly Language[] = ["javascript", "typescript", "python", "rust", "go"]
  if (options.language && options.mode === "words" && !wordLanguages.includes(options.language)) {
    throw new OptionError("words mode supports: en, fr, de, es")
  }
  if (options.language && options.mode === "code" && !codeLanguages.includes(options.language)) {
    throw new OptionError("code mode supports: javascript, typescript, python, rust, go")
  }
  if (options.language && options.mode !== "words" && options.mode !== "code") {
    throw new OptionError("--language is only available in words and code modes")
  }

  return options
}

export function helpText(): string {
  return `typ.ing ${VERSION} — a focused typing trainer for your terminal

Usage:
  typ.ing [options]
  npx typdoting [options]
  typ.ing login | logout | whoami

Options:
  -m, --mode <mode>   words, quotes, code, numbers, symbols,
                      readwise, or custom (default: words)
  -l, --language <id> en, fr, de, es, javascript, typescript,
                      python, rust, or go
  -t, --time <secs>   test duration from 5 to 300 (default: 30)
      --file <path>   practice a local UTF-8 text file
      --text <text>   practice supplied text
      --seed <number> deterministic text selection
  -h, --help          show this help
  -v, --version       show the version

Commands:
  login               connect a Readwise account
  logout              remove the saved Readwise token
  whoami              show Readwise connection status

Navigation:
  Type a category, use ↑/↓ to move, and press Enter to select.
  Select duration to choose a session length the same way.
  Press / while a test is idle to open the options navigator.

Requires Bun 1.3 or newer.`
}
