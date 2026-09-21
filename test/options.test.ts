import { describe, expect, test } from "bun:test"

import { OptionError, parseOptions } from "../src/options.js"

describe("parseOptions", () => {
  test("uses focused defaults", () => {
    expect(parseOptions([])).toEqual({
      command: "train",
      durationSeconds: 30,
      mode: "words",
      startInNavigation: true,
      help: false,
      version: false,
    })
  })

  test("parses mode, time, and seed", () => {
    expect(parseOptions(["--mode", "code", "--time", "45", "--seed", "7"])).toEqual({
      command: "train",
      durationSeconds: 45,
      mode: "code",
      seed: 7,
      startInNavigation: false,
      help: false,
      version: false,
    })
  })

  test("rejects invalid options", () => {
    expect(() => parseOptions(["--mode", "unknown"])).toThrow(OptionError)
    expect(() => parseOptions(["--time", "2"])).toThrow(OptionError)
    expect(() => parseOptions(["--wat"])).toThrow(OptionError)
  })

  test("parses languages, custom text, and account commands", () => {
    expect(parseOptions(["--mode", "words", "--language", "fr"]).language).toBe("fr")
    expect(parseOptions(["--text", "practice this"])).toMatchObject({
      mode: "custom",
      text: "practice this",
      startInNavigation: false,
    })
    expect(parseOptions(["login"]).command).toBe("login")
  })

  test("validates mode-specific options", () => {
    expect(() => parseOptions(["--mode", "custom"])).toThrow(OptionError)
    expect(() => parseOptions(["--mode", "words", "--language", "rust"])).toThrow(OptionError)
    expect(() => parseOptions(["--mode", "symbols", "--language", "en"])).toThrow(OptionError)
  })
})
