import { afterEach, describe, expect, test } from "bun:test"
import { createTestRenderer, type TestRenderer } from "@opentui/core/testing"

import { mountApp } from "../src/app.js"
import type { CliOptions } from "../src/options.js"

const options: CliOptions = {
  command: "train",
  durationSeconds: 30,
  mode: "words",
  startInNavigation: false,
  help: false,
  version: false,
}

let activeRenderer: TestRenderer | null = null

afterEach(() => {
  activeRenderer?.destroy()
  activeRenderer = null
})

describe("trainer app", () => {
  test("logs in from the TUI with a masked pasted token", async () => {
    const setup = await createTestRenderer({ width: 100, height: 24, exitOnCtrlC: false })
    activeRenderer = setup.renderer
    let opened = 0
    let submittedToken = ""

    mountApp(
      setup.renderer,
      options,
      () => "practice words remain available for typing",
      {
        openReadwiseLogin: () => { opened += 1 },
        connectReadwise: async (token) => {
          submittedToken = token
          return "A saved Readwise highlight becomes the next typing exercise."
        },
        loadReadwise: async () => null,
      },
    )
    await setup.renderOnce()

    setup.mockInput.pressKey("l", { ctrl: true })
    await setup.flush()
    expect(opened).toBe(1)
    expect(setup.captureCharFrame()).toContain("Readwise login")

    await setup.mockInput.pasteBracketedText("secret-token")
    await setup.flush()
    const loginFrame = setup.captureCharFrame()
    expect(loginFrame).toContain("12 characters")
    expect(loginFrame).not.toContain("secret-token")

    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("Readwise connected"))
    const connectedFrame = setup.captureCharFrame()
    expect(submittedToken).toBe("secret-token")
    expect(connectedFrame).toContain("readwise")
    expect(connectedFrame).toContain("A saved Readwise highlight")
  })

  test("selects a category by typing its name", async () => {
    const setup = await createTestRenderer({ width: 100, height: 26, exitOnCtrlC: false })
    activeRenderer = setup.renderer
    const navigationOptions = { ...options, startInNavigation: true }

    mountApp(
      setup.renderer,
      navigationOptions,
      (mode) => `${mode} practice text is ready to type`,
      {
        openReadwiseLogin: () => {},
        connectReadwise: async () => "Readwise practice text",
        loadReadwise: async () => "Readwise practice text",
      },
    )
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain("Type or use your arrow keys to navigate")
    expect(setup.captureCharFrame()).toContain("/ type a category")

    await setup.mockInput.typeText("quo")
    await setup.flush()
    const filteredFrame = setup.captureCharFrame()
    expect(filteredFrame).toContain("/ quo")
    expect(filteredFrame).toContain("╭ quotes ╮")
    expect(filteredFrame).not.toContain("words")

    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("quotes practice text"))
    expect(setup.captureCharFrame()).toContain("quotes selected")

    setup.mockInput.pressKey("/")
    await setup.waitForFrame((frame) => frame.includes("Type or use your arrow keys to navigate"))
    setup.mockInput.pressArrow("down")
    await setup.waitForFrame((frame) => frame.includes("╭ code ╮"))
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("code practice text"))
  })

  test("selects a duration through the typed options flow", async () => {
    const setup = await createTestRenderer({ width: 100, height: 26, exitOnCtrlC: false })
    activeRenderer = setup.renderer
    const navigationOptions = { ...options, startInNavigation: true }

    mountApp(setup.renderer, navigationOptions, () => "practice text", {
      openReadwiseLogin: () => {},
      connectReadwise: async () => "Readwise practice text",
      loadReadwise: async () => "Readwise practice text",
    })
    await setup.renderOnce()

    await setup.mockInput.typeText("dur")
    await setup.flush()
    expect(setup.captureCharFrame()).toContain("╭ duration ╮")
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("/ type a duration"))

    await setup.mockInput.typeText("60")
    await setup.flush()
    expect(setup.captureCharFrame()).toContain("╭ 60 seconds ╮")
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("60 seconds selected"))
    expect(setup.captureCharFrame()).toContain("/text/words")
  })

  test("keeps the complete options picker visible in a compact terminal", async () => {
    const setup = await createTestRenderer({ width: 64, height: 20, exitOnCtrlC: false })
    activeRenderer = setup.renderer

    mountApp(setup.renderer, { ...options, startInNavigation: true }, () => "practice text", {
      openReadwiseLogin: () => {},
      connectReadwise: async () => "Readwise practice text",
      loadReadwise: async () => "Readwise practice text",
    })
    await setup.renderOnce()

    const frame = setup.captureCharFrame()
    expect(frame).toContain("duration")
    expect(frame).toContain("Enter to select")
    expect(frame).toContain("ctrl+c quit")
  })
})
