export const VERSION = "0.1.0"

export const MODES = ["words", "quotes", "code"] as const
export type Mode = (typeof MODES)[number]

export const PRESET_DURATIONS = [15, 30, 60, 120] as const

export interface CliOptions {
  durationSeconds: number
  mode: Mode
  seed?: number
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
    durationSeconds: 30,
    mode: "words",
    help: false,
    version: false,
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

  return options
}

export function helpText(): string {
  return `typ.ing ${VERSION} — a focused typing trainer for your terminal

Usage:
  typ.ing [options]
  npx typdoting [options]

Options:
  -m, --mode <mode>   words, quotes, or code (default: words)
  -t, --time <secs>   test duration from 5 to 300 (default: 30)
      --seed <number> deterministic text selection
  -h, --help          show this help
  -v, --version       show the version

Requires Bun 1.3 or newer.`
}
