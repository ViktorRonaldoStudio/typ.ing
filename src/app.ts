import {
  BoxRenderable,
  StyledText,
  TextRenderable,
  bg,
  bold,
  createCliRenderer,
  decodePasteBytes,
  fg,
  t,
  underline,
  type CliRenderer,
  type KeyEvent,
  type PasteEvent,
  type TextChunk,
} from "@opentui/core"
import { readFile } from "node:fs/promises"

import {
  connectReadwise,
  fetchReadwiseHighlights,
  openReadwiseTokenPage,
  savedReadwiseToken,
} from "./account.js"
import { createContent, createPhraseContent } from "./content.js"
import { type CliOptions, type Mode } from "./options.js"
import { seededRandom, type RandomSource } from "./random.js"
import { TypingSession } from "./session.js"

const COLORS = {
  background: "#323546",
  panel: "#323546",
  border: "#4A4D5D",
  text: "#FFFFFF",
  muted: "#8A8A8A",
  subtle: "#C8C8C8",
  accent: "#FFFFFF",
  active: "#21CAFF",
  correct: "#FFFFFF",
  error: "#84051B",
  errorBackground: "#E8D7DA",
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

interface CategoryOption {
  mode: Exclude<Mode, "custom">
  label: string
  description: string
  keywords: string
}

interface DurationOption {
  seconds: number
  label: string
  description: string
  keywords: string
}

type NavigationOption =
  | ({ kind: "category" } & CategoryOption)
  | ({ kind: "duration-menu" } & Omit<DurationOption, "seconds">)
  | ({ kind: "duration" } & DurationOption)

type NavigationPage = "categories" | "duration"

const CATEGORY_OPTIONS: readonly CategoryOption[] = [
  { mode: "words", label: "words", description: "common vocabulary", keywords: "words common vocabulary language" },
  { mode: "quotes", label: "quotes", description: "sentences and prose", keywords: "quotes sentences prose text" },
  { mode: "code", label: "code", description: "programming syntax", keywords: "code programming syntax" },
  { mode: "numbers", label: "numbers", description: "dates, times, and figures", keywords: "numbers dates times figures digits" },
  { mode: "symbols", label: "symbols", description: "punctuation and operators", keywords: "symbols punctuation operators" },
  { mode: "readwise", label: "readwise", description: "your saved highlights", keywords: "readwise highlights saved" },
]

const DURATION_OPTIONS: readonly DurationOption[] = [
  { seconds: 15, label: "15 seconds", description: "a quick warm-up", keywords: "15 seconds duration time quick warm up" },
  { seconds: 30, label: "30 seconds", description: "the default session", keywords: "30 seconds duration time default" },
  { seconds: 60, label: "60 seconds", description: "a full minute", keywords: "60 seconds duration time minute" },
  { seconds: 120, label: "120 seconds", description: "a longer challenge", keywords: "120 seconds duration time minutes long" },
]

function typingText(session: TypingSession, start: number, end: number): StyledText {
  const chunks: TextChunk[] = []
  const limit = Math.min(end, session.target.length)
  let currentKind = ""
  let currentText = ""

  const flush = () => {
    if (!currentText) return
    if (currentKind === "correct") chunks.push(fg(COLORS.correct)(currentText))
    if (currentKind === "wrong") chunks.push(bg(COLORS.errorBackground)(underline(fg(COLORS.error)(currentText))))
    if (currentKind === "pending") chunks.push(fg(COLORS.muted)(currentText))
    currentText = ""
  }

  for (let index = start; index < limit; index += 1) {
    if (index === session.typed.length && session.status !== "finished") {
      flush()
      const cursorCharacter = session.target[index] ?? " "
      chunks.push(bg(COLORS.active)(bold(fg(COLORS.background)(cursorCharacter))))
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
  return t`${fg(COLORS.text)("━".repeat(filled))}${fg(COLORS.border)("━".repeat(size - filled))}`
}

type ContentFactory = (mode: Mode) => string
type LoginState = "input" | "validating" | "error"

interface AppServices {
  openReadwiseLogin: () => void
  connectReadwise: (token: string) => Promise<string>
  loadReadwise: () => Promise<string | null>
}

class TrainerApp {
  private readonly renderer: CliRenderer
  private readonly createTarget: ContentFactory
  private readonly services: AppServices
  private mode: Mode
  private durationSeconds: number
  private session: TypingSession
  private readwiseContent: string | null = null
  private navigationOpen: boolean
  private navigationPage: NavigationPage = "categories"
  private navigationQuery = ""
  private navigationIndex = 0
  private navigationLoading = false
  private navigationError = ""
  private loginState: LoginState | null = null
  private loginToken = ""
  private loginError = ""
  private notice = ""
  private viewStart = 0
  private timer: ReturnType<typeof setInterval> | null = null

  private readonly shell: BoxRenderable
  private readonly settingsText: TextRenderable
  private readonly statsText: TextRenderable
  private readonly typingPanel: BoxRenderable
  private readonly typingDisplay: TextRenderable
  private readonly progressDisplay: TextRenderable
  private readonly hintText: TextRenderable

  constructor(
    renderer: CliRenderer,
    options: CliOptions,
    createTarget: ContentFactory,
    services: AppServices,
  ) {
    this.renderer = renderer
    this.createTarget = createTarget
    this.services = services
    this.mode = options.mode
    this.durationSeconds = options.durationSeconds
    this.session = this.newSession()
    this.navigationOpen = options.startInNavigation

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
      paddingTop: 1,
      paddingBottom: 0,
      paddingLeft: 2,
      paddingRight: 2,
      flexDirection: "column",
      gap: 0,
    })

    const header = new BoxRenderable(renderer, {
      width: "100%",
      flexDirection: "row",
      justifyContent: "space-between",
    })
    header.add(new TextRenderable(renderer, {
      content: t`${bold(fg(COLORS.text)("typ.ing"))}`,
      selectable: false,
    }))
    header.add(new TextRenderable(renderer, {
      content: t`${fg(COLORS.muted)("Typey typey type")}`,
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
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 2,
      paddingRight: 2,
      border: false,
      borderColor: COLORS.border,
      backgroundColor: COLORS.panel,
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
      content: t`${fg(COLORS.text)("/")} ${fg(COLORS.muted)("options   ")}${fg(COLORS.text)("ctrl+l")} ${fg(COLORS.muted)("readwise   ")}${fg(COLORS.text)("tab")} ${fg(COLORS.muted)("restart   ")}${fg(COLORS.text)("ctrl+c")} ${fg(COLORS.muted)("quit")}`,
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
    renderer.keyInput.on("paste", this.onPaste)
    renderer.on("resize", this.onResize)
    renderer.once("destroy", this.destroy)

    this.timer = setInterval(() => {
      if (this.session.tick()) this.render()
      else if (this.session.status === "running") this.renderStats()
    }, 100)

    this.render()
  }

  private newSession(): TypingSession {
    const target = this.mode === "readwise" && this.readwiseContent
      ? this.readwiseContent
      : this.createTarget(this.mode)
    return new TypingSession(target, this.durationSeconds)
  }

  private restart(): void {
    this.session = this.newSession()
    this.viewStart = 0
    this.render()
  }

  private onKeyPress = (key: KeyEvent): void => {
    if (key.ctrl && key.name === "c") return

    if (this.loginState) {
      this.onLoginKeyPress(key)
      return
    }

    if (key.ctrl && key.name === "l") {
      key.preventDefault()
      this.openLogin()
      return
    }

    if (this.navigationOpen) {
      this.onNavigationKeyPress(key)
      return
    }

    if (key.sequence === "/" && this.session.status !== "running") {
      key.preventDefault()
      this.openNavigation()
      return
    }

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

  private navigationOptions(): readonly NavigationOption[] {
    if (this.navigationPage === "duration") {
      return DURATION_OPTIONS.map((option) => ({ kind: "duration" as const, ...option }))
    }
    return [
      ...CATEGORY_OPTIONS.map((option) => ({ kind: "category" as const, ...option })),
      {
        kind: "duration-menu" as const,
        label: "duration",
        description: `${this.durationSeconds} seconds selected`,
        keywords: "duration time seconds length",
      },
    ]
  }

  private navigationMatches(): readonly NavigationOption[] {
    const query = this.navigationQuery.trim().toLowerCase()
    const options = this.navigationOptions()
    if (!query) return options
    return options.filter(({ keywords }) => keywords.includes(query))
  }

  private onNavigationKeyPress(key: KeyEvent): void {
    key.preventDefault()
    if (this.navigationLoading) return

    if (key.name === "escape") {
      if (this.navigationPage === "duration") {
        this.navigationPage = "categories"
        this.navigationQuery = ""
        this.navigationIndex = CATEGORY_OPTIONS.length
        this.navigationError = ""
        this.render()
        return
      }
      this.navigationOpen = false
      this.navigationQuery = ""
      this.navigationError = ""
      this.notice = "Options closed"
      this.render()
      return
    }

    if (key.name === "backspace") {
      this.navigationQuery = this.navigationQuery.slice(0, -1)
      this.navigationIndex = 0
      this.navigationError = ""
      this.render()
      return
    }

    const matches = this.navigationMatches()
    if (key.name === "up" || key.name === "down") {
      if (matches.length > 0) {
        const direction = key.name === "up" ? -1 : 1
        this.navigationIndex = (this.navigationIndex + direction + matches.length) % matches.length
      }
      this.render()
      return
    }

    if (key.name === "return") {
      const selection = matches[this.navigationIndex]
      if (selection) void this.selectNavigationOption(selection)
      return
    }

    if (key.ctrl || key.meta || key.option) return
    const character = key.name === "space" ? " " : key.sequence
    const isPrintable = Array.from(character).length === 1 && !/[\u0000-\u001f\u007f]/u.test(character)
    if (isPrintable) {
      this.navigationQuery += character.toLowerCase()
      this.navigationIndex = 0
      this.navigationError = ""
      this.render()
    }
  }

  private openNavigation(): void {
    this.navigationOpen = true
    this.navigationPage = "categories"
    this.navigationQuery = ""
    this.navigationIndex = Math.max(0, CATEGORY_OPTIONS.findIndex(({ mode }) => mode === this.mode))
    this.navigationLoading = false
    this.navigationError = ""
    this.notice = ""
    this.render()
  }

  private async selectNavigationOption(selection: NavigationOption): Promise<void> {
    if (selection.kind === "duration-menu") {
      this.navigationPage = "duration"
      this.navigationQuery = ""
      this.navigationIndex = Math.max(0, DURATION_OPTIONS.findIndex(({ seconds }) => seconds === this.durationSeconds))
      this.navigationError = ""
      this.render()
      return
    }

    if (selection.kind === "duration") {
      this.durationSeconds = selection.seconds
      this.navigationOpen = false
      this.navigationPage = "categories"
      this.navigationQuery = ""
      this.navigationError = ""
      this.notice = `${selection.label} selected — start typing`
      this.restart()
      return
    }

    await this.selectCategory(selection)
  }

  private async selectCategory(selection: CategoryOption): Promise<void> {
    if (selection.mode === "readwise" && this.mode !== "readwise" && !this.readwiseContent) {
      this.navigationLoading = true
      this.navigationError = ""
      this.render()
      try {
        this.readwiseContent = await this.services.loadReadwise()
        if (!this.readwiseContent) {
          this.navigationOpen = false
          this.navigationLoading = false
          this.openLogin()
          return
        }
      } catch (error) {
        this.navigationLoading = false
        this.navigationError = error instanceof Error ? error.message : String(error)
        this.render()
        return
      }
    }

    this.mode = selection.mode
    this.navigationOpen = false
    this.navigationQuery = ""
    this.navigationLoading = false
    this.navigationError = ""
    this.notice = `${selection.label} selected — start typing`
    this.restart()
  }

  private onLoginKeyPress(key: KeyEvent): void {
    key.preventDefault()
    if (this.loginState === "validating") return

    if (key.name === "escape") {
      this.loginState = null
      this.loginToken = ""
      this.loginError = ""
      this.notice = "Readwise login cancelled"
      this.render()
      return
    }

    if (key.name === "return") {
      void this.submitLogin()
      return
    }

    if (key.name === "backspace") {
      this.loginToken = this.loginToken.slice(0, -1)
      this.loginState = "input"
      this.loginError = ""
      this.render()
      return
    }

    if (key.ctrl || key.meta || key.option) return
    const printable = Array.from(key.sequence)
      .filter((character) => !/[\u0000-\u001f\u007f\s]/u.test(character))
      .join("")
    if (printable) {
      this.addLoginToken(printable)
    }
  }

  private onPaste = (event: PasteEvent): void => {
    if (!this.loginState || this.loginState === "validating") return
    event.preventDefault()
    const pasted = decodePasteBytes(event.bytes).replace(/\s+/g, "")
    if (pasted) this.addLoginToken(pasted)
  }

  private addLoginToken(value: string): void {
    this.loginToken = `${this.loginToken}${value}`.slice(0, 512)
    this.loginState = "input"
    this.loginError = ""
    this.render()
  }

  private openLogin(): void {
    this.navigationOpen = false
    this.loginState = "input"
    this.loginToken = ""
    this.loginError = ""
    this.notice = ""
    this.session = this.newSession()
    this.viewStart = 0
    this.services.openReadwiseLogin()
    this.render()
  }

  private async submitLogin(): Promise<void> {
    const token = this.loginToken.trim()
    if (!token) {
      this.loginState = "error"
      this.loginError = "Paste a token before connecting"
      this.render()
      return
    }

    this.loginState = "validating"
    this.loginError = ""
    this.render()
    try {
      this.readwiseContent = await this.services.connectReadwise(token)
      this.mode = "readwise"
      this.loginState = null
      this.loginToken = ""
      this.notice = "Readwise connected — highlights loaded"
      this.restart()
    } catch (error) {
      this.loginToken = ""
      this.loginState = "error"
      this.loginError = error instanceof Error ? error.message : String(error)
      this.render()
    }
  }

  private onResize = (): void => {
    this.shell.width = this.shellWidth()
    this.updateWindow()
    this.render()
  }

  private destroy = (): void => {
    if (this.timer !== null) clearInterval(this.timer)
    this.renderer.keyInput.off("keypress", this.onKeyPress)
    this.renderer.keyInput.off("paste", this.onPaste)
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
    this.settingsText.content = t`${bold(fg(COLORS.text)(`/text/${this.mode}`))}${fg(COLORS.border)("  ·  ")}${fg(COLORS.subtle)(`${this.durationSeconds} seconds`)}`
  }

  private renderStats(): void {
    const metrics = this.session.metrics()
    this.statsText.visible = true
    this.progressDisplay.visible = true
    this.statsText.content = t`${fg(COLORS.muted)("wpm ")}${bold(fg(COLORS.text)(metrics.wpm))}${fg(COLORS.border)("   ")}${fg(COLORS.muted)("acc ")}${bold(fg(COLORS.text)(`${metrics.accuracy.toFixed(0)}%`))}${fg(COLORS.border)("   ")}${bold(fg(COLORS.text)(`${metrics.remainingSeconds}s`))}`
    this.progressDisplay.content = progressBar(metrics.progress, this.contentWidth())
  }

  private renderResult(): void {
    const metrics = this.session.metrics()
    const width = this.contentWidth()
    const headline = `${metrics.wpm} WPM`
    const details = `${metrics.accuracy.toFixed(1)}% accuracy  ·  ${metrics.rawWpm} raw  ·  ${metrics.mistakes} errors`
    const keystrokes = `${metrics.totalKeypresses} keystrokes in ${this.durationSeconds}s`
    const pad = (text: string) => " ".repeat(Math.max(0, Math.floor((width - text.length) / 2)))

    this.typingPanel.height = 10
    this.typingPanel.title = undefined
    this.typingPanel.border = false
    this.typingDisplay.content = t`\n${pad(headline)}${bold(fg(COLORS.text)(headline))}\n${pad(details)}${fg(COLORS.subtle)(details)}\n${pad(keystrokes)}${fg(COLORS.muted)(keystrokes)}`
    this.hintText.content = "enter or space to go again"
  }

  private navigationLabelChunks(label: string, selected: boolean): TextChunk[] {
    const query = this.navigationQuery.trim().toLowerCase()
    if (!query) return [selected ? bold(fg(COLORS.text)(label)) : fg(COLORS.muted)(label)]

    const start = label.toLowerCase().indexOf(query)
    if (start < 0) return [selected ? bold(fg(COLORS.text)(label)) : fg(COLORS.muted)(label)]

    const chunks: TextChunk[] = []
    if (start > 0) chunks.push(fg(COLORS.muted)(label.slice(0, start)))
    chunks.push(bold(fg(COLORS.text)(label.slice(start, start + query.length))))
    if (start + query.length < label.length) {
      chunks.push(fg(COLORS.muted)(label.slice(start + query.length)))
    }
    return chunks
  }

  private renderNavigation(): void {
    const matches = this.navigationMatches()
    const placeholder = this.navigationPage === "duration" ? "type a duration" : "type a category"
    const chunks: TextChunk[] = [
      bold(fg(COLORS.text)("/ ")),
      this.navigationQuery ? bold(fg(COLORS.text)(this.navigationQuery)) : fg(COLORS.muted)(placeholder),
      fg(COLORS.border)("\n\n"),
    ]

    if (matches.length === 0) {
      chunks.push(bg(COLORS.errorBackground)(fg(COLORS.error)(" no matching option ")))
    } else {
      for (const [index, option] of matches.entries()) {
        const selected = index === this.navigationIndex
        chunks.push(selected ? fg(COLORS.text)("╭ ") : fg(COLORS.background)("  "))
        chunks.push(...this.navigationLabelChunks(option.label, selected))
        chunks.push(selected ? fg(COLORS.text)(" ╮") : fg(COLORS.background)("  "))
        chunks.push(fg(COLORS.muted)(`  ${option.description}`))
        if (index < matches.length - 1) chunks.push(fg(COLORS.border)("\n"))
      }
    }

    if (this.navigationError) {
      chunks.push(fg(COLORS.border)("\n\n"), bg(COLORS.errorBackground)(fg(COLORS.error)(` ${this.navigationError} `)))
    } else if (this.navigationLoading) {
      chunks.push(fg(COLORS.border)("\n\n"), bold(fg(COLORS.active)("Loading Readwise highlights…")))
    }

    this.settingsText.content = t`${fg(COLORS.text)("Type or use your arrow keys to navigate")}`
    this.statsText.visible = false
    this.progressDisplay.visible = false
    this.statsText.content = ""
    this.progressDisplay.content = ""
    this.typingPanel.height = 9
    this.typingPanel.title = undefined
    this.typingPanel.border = false
    this.typingDisplay.content = new StyledText(chunks)
    this.hintText.content = "Enter to select   ·   Esc to go back"
  }

  private renderLogin(): void {
    const validating = this.loginState === "validating"
    const maskedLength = Math.min(this.loginToken.length, Math.max(12, this.contentWidth() - 10))
    const masked = this.loginToken.length === 0
      ? "paste token here"
      : `${"•".repeat(maskedLength)}${this.loginToken.length > maskedLength ? "…" : ""}`
    const status = validating
      ? bold(fg(COLORS.active)("Validating token and loading highlights…"))
      : this.loginState === "error"
        ? bg(COLORS.errorBackground)(fg(COLORS.error)(` ${this.loginError} `))
        : fg(COLORS.muted)("The Readwise access-token page opened in your browser.")

    this.typingPanel.height = 10
    this.typingPanel.title = undefined
    this.typingPanel.border = false
    this.settingsText.content = t`${bold(fg(COLORS.text)("Readwise login"))}`
    this.statsText.visible = false
    this.progressDisplay.visible = false
    this.statsText.content = ""
    this.progressDisplay.content = ""
    this.typingDisplay.content = new StyledText([
      fg(COLORS.text)("Paste your Readwise token, then press Enter.\n\n"),
      fg(COLORS.text)("╭ "),
      this.loginToken.length === 0 ? fg(COLORS.muted)(masked) : fg(COLORS.text)(masked),
      fg(COLORS.text)(" ╮"),
      fg(COLORS.muted)(`  ${this.loginToken.length} characters\n\n`),
      status,
    ])
    this.hintText.content = validating ? "please wait" : "enter connect   ·   esc cancel"
  }

  private render(): void {
    if (this.navigationOpen) {
      this.renderNavigation()
      return
    }

    this.renderSettings()
    this.renderStats()

    if (this.loginState) {
      this.renderLogin()
      return
    }

    if (this.session.status === "finished") {
      this.renderResult()
      return
    }

    this.updateWindow()
    const width = this.contentWidth()
    this.typingPanel.height = 10
    this.typingPanel.title = undefined
    this.typingPanel.border = false
    this.typingDisplay.content = typingText(
      this.session,
      this.viewStart,
      this.viewStart + width * 5,
    )
    this.hintText.content = this.session.status === "ready"
      ? this.notice || "start typing   ·   / options"
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
  appServices?: AppServices,
): void {
  const random: RandomSource = options.seed === undefined ? Math.random : seededRandom(options.seed)
  const fallback = (mode: Mode) => createContent(mode, random, 5_000, options.language)
  const services: AppServices = appServices ?? {
    openReadwiseLogin: openReadwiseTokenPage,
    connectReadwise: async (token) => {
      const normalizedToken = await connectReadwise(token)
      const highlights = await fetchReadwiseHighlights(normalizedToken)
      if (highlights.length === 0) throw new Error("No usable Readwise highlights were found")
      return createPhraseContent(highlights, random)
    },
    loadReadwise: async () => {
      const token = process.env.READWISE_TOKEN?.trim() ?? await savedReadwiseToken()
      if (!token) return null
      const highlights = await fetchReadwiseHighlights(token)
      if (highlights.length === 0) throw new Error("No usable Readwise highlights were found")
      return createPhraseContent(highlights, random)
    },
  }
  new TrainerApp(renderer, options, createTarget ?? fallback, services)
}
