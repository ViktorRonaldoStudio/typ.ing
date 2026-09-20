import { describe, expect, test } from "bun:test"

import { createContent, createPhraseContent } from "../src/content.js"
import { seededRandom } from "../src/random.js"

describe("practice content", () => {
  test("builds deterministic number and symbol drills", () => {
    const numbers = createContent("numbers", seededRandom(3), 200)
    const symbols = createContent("symbols", seededRandom(3), 200)

    expect(numbers).toMatch(/[0-9]+/)
    expect(numbers.length).toBeGreaterThanOrEqual(200)
    expect(symbols).toContain("{")
    expect(symbols.length).toBeGreaterThanOrEqual(200)
  })

  test("supports prose and code languages", () => {
    const french = createContent("words", seededRandom(4), 500, "fr")
    const python = createContent("code", seededRandom(4), 500, "python")

    expect(french).not.toContain("because")
    expect(python).toMatch(/def |for |await |with /)
  })

  test("turns external phrases into a full practice target", () => {
    const content = createPhraseContent(["A meaningful saved highlight."], seededRandom(1), 100)
    expect(content.length).toBeGreaterThanOrEqual(100)
    expect(content).toContain("meaningful")
  })
})
