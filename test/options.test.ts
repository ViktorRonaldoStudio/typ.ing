import { describe, expect, test } from "bun:test"

import { OptionError, parseOptions } from "../src/options.js"

describe("parseOptions", () => {
  test("uses focused defaults", () => {
    expect(parseOptions([])).toEqual({
      durationSeconds: 30,
      mode: "words",
      help: false,
      version: false,
    })
  })

  test("parses mode, time, and seed", () => {
    expect(parseOptions(["--mode", "code", "--time", "45", "--seed", "7"])).toEqual({
      durationSeconds: 45,
      mode: "code",
      seed: 7,
      help: false,
      version: false,
    })
  })

  test("rejects invalid options", () => {
    expect(() => parseOptions(["--mode", "numbers"])).toThrow(OptionError)
    expect(() => parseOptions(["--time", "2"])).toThrow(OptionError)
    expect(() => parseOptions(["--wat"])).toThrow(OptionError)
  })
})
