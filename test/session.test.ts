import { describe, expect, test } from "bun:test"

import { TypingSession } from "../src/session.js"

describe("TypingSession", () => {
  test("starts on the first character and records accuracy", () => {
    const session = new TypingSession("hello", 30)

    session.input("h", 1_000)
    session.input("x", 2_000)

    expect(session.status).toBe("running")
    expect(session.startedAt).toBe(1_000)
    expect(session.typed).toBe("hx")
    expect(session.metrics(2_000).accuracy).toBe(50)
  })

  test("backspace changes text without erasing keypress history", () => {
    const session = new TypingSession("hello", 30)

    session.input("x", 1_000)
    session.backspace(1_100)
    session.input("h", 1_200)

    expect(session.typed).toBe("h")
    expect(session.metrics(1_200)).toMatchObject({
      totalKeypresses: 2,
      correctKeypresses: 1,
      mistakes: 1,
      accuracy: 50,
    })
  })

  test("finishes exactly at the duration and calculates WPM", () => {
    const session = new TypingSession("a".repeat(500), 60)
    for (let index = 0; index < 250; index += 1) session.input("a", index === 0 ? 0 : 1_000)

    expect(session.tick(60_000)).toBe(true)
    expect(session.metrics(70_000)).toMatchObject({
      status: "finished",
      remainingSeconds: 0,
      progress: 1,
      wpm: 50,
      rawWpm: 50,
      accuracy: 100,
    })
  })

  test("does not start on backspace", () => {
    const session = new TypingSession("hello", 15)
    expect(session.backspace(1_000)).toBe(false)
    expect(session.status).toBe("ready")
  })
})
