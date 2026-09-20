import {
  BoxRenderable,
  StyledText,
  TextRenderable,
  bg,
  bold,
  createCliRenderer,
  fg,
  t,
  underline,
  type CliRenderer,
  type KeyEvent,
  type TextChunk,
} from "@opentui/core"
import { readFile } from "node:fs/promises"

import { fetchReadwiseHighlights, savedReadwiseToken } from "./account.js"
import { createContent, createPhraseContent } from "./content.js"
import { type CliOptions, type Mode } from "./options.js"
import { seededRandom, type RandomSource } from "./random.js"
import { TypingSession } from "./session.js"

const COLORS = {
  background: "#101218",
  panel: "#171A22",
  border: "#303541",
  text: "#D9DEE8",
  muted: "#69707D",
  subtle: "#9299A6",
  accent: "#E2B714",
  correct: "#B9C0CC",
  error: "#FF5C74",
  errorBackground: "#431F2A",
} as const

const MODE_KEYS: ReadonlyArray<{ key: string; mode: Mode }> = [
  { key: "f1", mode: "words" },
  { key: "f2", mode: "quotes" },
  { key: "f3", mode: "code" },
  { key: "f4", mode: "numbers" },
  { key: "f5", mode: "symbols" },
]

const TIME_KEYS: ReadonlyArray<{ key: string; seconds: number }> = [
  { key: "f6", seconds: 15 },
  { key: "f7", seconds: 30 },
  { key: "f8", seconds: 60 },
  { key: "f9", seconds: 120 },
]

function labelChunks(
  options: ReadonlyArray<{ key: string; label: string; selected: boolean }>,
): TextChunk[] {
  const chunks: TextChunk[] = []
  for (const [index, option] of options.entries()) {
    if (index > 0) chunks.push(fg(COLORS.border)("  "))
    chunks.push(fg(COLORS.muted)(`${option.key} `))
    chunks.push(option.selected
      ? bold(fg(COLORS.accent)(option.label))
      : fg(COLORS.subtle)(option.label))
  }
  return chunks
}

function typingText(session: TypingSession, start: number, end: number): StyledText {
  const chunks: TextChunk[] = []
  const limit = Math.min(end, session.target.length)
  let currentKind = ""
  let currentText = ""

  const flush = () => {
    if (!currentText) return
    if (currentKind === "correct") chunks.push(fg(COLORS.correct)(currentText))
    if (currentKind === "wrong") chunks.push(underline(fg(COLORS.error)(currentText)))
    if (currentKind === "pending") chunks.push(fg(COLORS.muted)(currentText))
    currentText = ""
  }

  for (let index = start; index < limit; index += 1) {
    if (index === session.typed.length && session.status !== "finished") {
      flush()
      const cursorCharacter = session.target[index] ?? " "
      chunks.push(bg(COLORS.accent)(bold(fg(COLORS.background)(cursorCharacter))))
      currentKind = ""
      continue
    }

    let kind = "pending"
    let character = session.target[index] ?? ""
    if (index < session.typed.length) {
      const typedCharacter = session.typed[index] ?? ""
      kind = typedCharacter === character ? "correct" : "wrong"
      character = kind === "wrong" && typedCharacter === " " ? "·" : typedCharacter
    }

    if (kind !== currentKind) {
      flush()
      currentKind = kind
    }
    currentText += character
  }
  flush()

  return new StyledText(chunks)
}

function progressBar(progress: number, width: number): StyledText {
  const size = Math.max(10, width)
  const filled = Math.round(size * progress)
  return t`${fg(COLORS.accent)("━".repeat(filled))}${fg(COLORS.border)("━".repeat(size - filled))}`
}

type ContentFactory = (mode: Mode) => string

class TrainerApp {
  private readonly renderer: CliRenderer
  private readonly createTarget: ContentFactory
  private mode: Mode
  private durationSeconds: number
  private session: TypingSession
  private viewStart = 0
  private timer: ReturnType<typeof setInterval> | null = null

  private readonly shell: BoxRenderable
  private readonly settingsText: TextRenderable
  private readonly statsText: TextRenderable
  private readonly typingPanel: BoxRenderable
  private readonly typingDisplay: TextRenderable
  private readonly progressDisplay: TextRenderable
  private readonly hintText: TextRenderable

  constructor(renderer: CliRenderer, options: CliOptions, createTarget: ContentFactory) {
    this.renderer = renderer
    this.createTarget = createTarget
    this.mode = options.mode
    this.durationSeconds = options.durationSeconds
    this.session = this.newSession()

    const page = new BoxRenderable(renderer, {
      id: "page",
      width: "100%",
      height: "100%",
      backgroundColor: COLORS.background,
      alignItems: "center",
    })

    this.shell = new BoxRenderable(renderer, {
      id: "shell",
      width: this.shellWidth(),
      height: "100%",
      paddingTop: 2,
      paddingBottom: 1,
      paddingLeft: 2,
      paddingRight: 2,
      flexDirection: "column",
      gap: 1,
    })

    const header = new BoxRenderable(renderer, {
      width: "100%",
      flexDirection: "row",
      justifyContent: "space-between",
    })
    header.add(new TextRenderable(renderer, {
      content: t`${bold(fg(COLORS.accent)("typ"))}${bold(fg(COLORS.text)(".ing"))}`,
      selectable: false,
    }))
    header.add(new TextRenderable(renderer, {
      content: t`${fg(COLORS.muted)("terminal typing trainer")}`,
      selectable: false,
    }))

    this.settingsText = new TextRenderable(renderer, {
      width: "100%",
      selectable: false,
    })

    const statsRow = new BoxRenderable(renderer, {
      width: "100%",
      flexDirection: "row",
      justifyContent: "flex-end",
    })
    this.statsText = new TextRenderable(renderer, {
      selectable: false,
    })
    statsRow.add(this.statsText)

    this.typingPanel = new BoxRenderable(renderer, {
      id: "typing-panel",
      width: "100%",
      height: 10,
      padding: 1,
      border: true,
      borderStyle: "rounded",
      borderColor: COLORS.border,
      backgroundColor: COLORS.panel,
      title: " type to begin ",
      titleColor: COLORS.accent,
      titleAlignment: "center",
    })

    this.typingDisplay = new TextRenderable(renderer, {
      width: "100%",
      height: "100%",
      wrapMode: "word",
      selectable: false,
    })
    this.typingPanel.add(this.typingDisplay)

    this.progressDisplay = new TextRenderable(renderer, {
      width: "100%",
      height: 1,
      selectable: false,
    })

    const hintRow = new BoxRenderable(renderer, {
      width: "100%",
      flexDirection: "row",
      justifyContent: "center",
    })
    this.hintText = new TextRenderable(renderer, {
      fg: COLORS.muted,
      selectable: false,
    })
    hintRow.add(this.hintText)

    const spacer = new BoxRenderable(renderer, { flexGrow: 1 })
    const footerRow = new BoxRenderable(renderer, {
      width: "100%",
      flexDirection: "row",
      justifyContent: "center",
    })
    const footer = new TextRenderable(renderer, {
      content: t`${fg(COLORS.subtle)("tab")} ${fg(COLORS.muted)("restart   ")}${fg(COLORS.subtle)("esc")} ${fg(COLORS.muted)("reset   ")}${fg(COLORS.subtle)("ctrl+c")} ${fg(COLORS.muted)("quit")}`,
      selectable: false,
    })
    footerRow.add(footer)

    this.shell.add(header)
    this.shell.add(this.settingsText)
    this.shell.add(statsRow)
    this.shell.add(this.typingPanel)
    this.shell.add(this.progressDisplay)
    this.shell.add(hintRow)
    this.shell.add(spacer)
    this.shell.add(footerRow)
    page.add(this.shell)
    renderer.root.add(page)

    renderer.setTerminalTitle("typ.ing")
    renderer.keyInput.on("keypress", this.onKeyPress)
    renderer.on("resize", this.onResize)
    renderer.once("destroy", this.destroy)

    this.timer = setInterval(() => {
      if (this.session.tick()) this.render()
      else if (this.session.status === "running") this.renderStats()
    }, 100)

    this.render()
  }

  private newSession(): TypingSession {
    return new TypingSession(this.createTarget(this.mode), this.durationSeconds)
  }

  private restart(): void {
    this.session = this.newSession()
    this.viewStart = 0
    this.render()
  }

  private onKeyPress = (key: KeyEvent): void => {
    if (key.ctrl && key.name === "c") return

    if (key.name === "tab") {
      key.preventDefault()
      this.restart()
      return
    }

    if (key.name === "escape") {
      this.restart()
      return
    }

    if (this.session.status === "finished") {
      if (key.name === "return" || key.name === "space") this.restart()
      return
    }

    if (this.session.status === "ready") {
      const modeChoice = MODE_KEYS.find((choice) => choice.key === key.name)
      if (modeChoice) {
        this.mode = modeChoice.mode
        this.restart()
        return
      }

      const timeChoice = TIME_KEYS.find((choice) => choice.key === key.name)
      if (timeChoice) {
        this.durationSeconds = timeChoice.seconds
        this.restart()
        return
      }
    }

    if (key.name === "backspace") {
      if (this.session.backspace()) this.render()
      return
    }

    if (key.ctrl || key.meta || key.option) return
    const character = key.name === "space" ? " " : key.sequence
    const isPrintable = Array.from(character).length === 1 && !/[\u0000-\u001f\u007f]/u.test(character)
    if (isPrintable && this.session.input(character)) this.render()
  }

  private onResize = (): void => {
    this.shell.width = this.shellWidth()
    this.updateWindow()
    this.render()
  }

  private destroy = (): void => {
    if (this.timer !== null) clearInterval(this.timer)
    this.renderer.keyInput.off("keypress", this.onKeyPress)
    this.renderer.off("resize", this.onResize)
  }

  private shellWidth(): number | "100%" {
    return this.renderer.terminalWidth > 104 ? 104 : "100%"
  }

  private contentWidth(): number {
    return Math.max(24, Math.min(96, this.renderer.terminalWidth - 8))
  }

  private updateWindow(): void {
    const width = this.contentWidth()
    const cursor = this.session.typed.length
    if (cursor < this.viewStart || cursor > this.viewStart + width * 2) {
      const preferred = Math.max(0, cursor - width)
      const nextSpace = this.session.target.indexOf(" ", preferred)
      this.viewStart = nextSpace >= 0 && nextSpace < cursor ? nextSpace + 1 : preferred
    }
  }

  private renderSettings(): void {
    const modeChunks = labelChunks(MODE_KEYS.map(({ key, mode }) => ({
      key: key.toUpperCase(),
      label: mode,
      selected: mode === this.mode,
    })))
    const timeChunks = labelChunks(TIME_KEYS.map(({ key, seconds }) => ({
      key: key.toUpperCase(),
      label: `${seconds}s`,
      selected: seconds === this.durationSeconds,
    })))

    const specialMode = this.mode === "readwise" || this.mode === "custom"
      ? [bold(fg(COLORS.accent)(this.mode)), fg(COLORS.border)("   │   ")]
      : []
    this.settingsText.content = new StyledText([
      ...specialMode,
      ...modeChunks,
      fg(COLORS.border)("     │     "),
      ...timeChunks,
    ])
  }

  private renderStats(): void {
    const metrics = this.session.metrics()
    this.statsText.content = t`${fg(COLORS.muted)("wpm ")}${bold(fg(COLORS.text)(metrics.wpm))}${fg(COLORS.border)("   ")}${fg(COLORS.muted)("acc ")}${bold(fg(COLORS.text)(`${metrics.accuracy.toFixed(0)}%`))}${fg(COLORS.border)("   ")}${bold(fg(COLORS.accent)(`${metrics.remainingSeconds}s`))}`
    this.progressDisplay.content = progressBar(metrics.progress, this.contentWidth())
  }

  private renderResult(): void {
    const metrics = this.session.metrics()
    const width = this.contentWidth()
    const headline = `${metrics.wpm} WPM`
    const details = `${metrics.accuracy.toFixed(1)}% accuracy  ·  ${metrics.rawWpm} raw  ·  ${metrics.mistakes} errors`
    const keystrokes = `${metrics.totalKeypresses} keystrokes in ${this.durationSeconds}s`
    const pad = (text: string) => " ".repeat(Math.max(0, Math.floor((width - text.length) / 2)))

    this.typingPanel.title = " result "
    this.typingPanel.borderColor = COLORS.accent
    this.typingDisplay.content = t`\n${pad(headline)}${bold(fg(COLORS.accent)(headline))}\n${pad(details)}${fg(COLORS.subtle)(details)}\n${pad(keystrokes)}${fg(COLORS.muted)(keystrokes)}`
    this.hintText.content = "enter or space to go again"
  }

  private render(): void {
    this.renderSettings()
    this.renderStats()

    if (this.session.status === "finished") {
      this.renderResult()
      return
    }

    this.updateWindow()
    const width = this.contentWidth()
    this.typingPanel.title = this.session.status === "ready" ? " type to begin " : " keep going "
    this.typingPanel.borderColor = this.session.status === "ready" ? COLORS.border : COLORS.accent
    this.typingDisplay.content = typingText(
      this.session,
      this.viewStart,
      this.viewStart + width * 5,
    )
    this.hintText.content = this.session.status === "ready"
      ? "choose a mode and time, then start typing"
      : ""
  }
}

export async function runApp(options: CliOptions): Promise<void> {
  const random = options.seed === undefined ? Math.random : seededRandom(options.seed)
  let externalContent: string | null = null

  if (options.mode === "custom") {
    const source = options.text ?? (options.file ? await readFile(options.file, "utf8") : "")
    externalContent = source.replace(/\s+/g, " ").trim()
    if (!externalContent) throw new Error("The custom practice text is empty")
  }

  if (options.mode === "readwise") {
    const token = process.env.READWISE_TOKEN?.trim() ?? await savedReadwiseToken()
    if (!token) throw new Error("Readwise is not connected. Run 'typ.ing login' first.")
    const highlights = await fetchReadwiseHighlights(token)
    if (highlights.length === 0) throw new Error("No usable Readwise highlights were found")
    externalContent = createPhraseContent(highlights, random)
  }

  const initialMode = options.mode
  const createTarget: ContentFactory = (mode) => {
    if (mode === initialMode && externalContent) return externalContent
    return createContent(mode, random, 5_000, options.language)
  }

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    backgroundColor: COLORS.background,
  })
  mountApp(renderer, options, createTarget)
}

export function mountApp(
  renderer: CliRenderer,
  options: CliOptions,
  createTarget?: ContentFactory,
): void {
  const random: RandomSource = options.seed === undefined ? Math.random : seededRandom(options.seed)
  const fallback = (mode: Mode) => createContent(mode, random, 5_000, options.language)
  new TrainerApp(renderer, options, createTarget ?? fallback)
}
