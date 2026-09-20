export type SessionStatus = "ready" | "running" | "finished"

export interface SessionMetrics {
  status: SessionStatus
  elapsedMs: number
  remainingSeconds: number
  progress: number
  wpm: number
  rawWpm: number
  accuracy: number
  correctKeypresses: number
  mistakes: number
  totalKeypresses: number
}

export class TypingSession {
  readonly durationMs: number
  readonly target: string

  typed = ""
  status: SessionStatus = "ready"
  startedAt: number | null = null
  endedAt: number | null = null
  correctKeypresses = 0
  mistakes = 0
  totalKeypresses = 0

  constructor(target: string, durationSeconds: number) {
    if (!target) throw new Error("Typing target cannot be empty")
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error("Duration must be positive")
    }

    this.target = target
    this.durationMs = durationSeconds * 1_000
  }

  input(character: string, now = Date.now()): boolean {
    this.tick(now)
    if (this.status === "finished" || character.length !== 1) return false

    if (this.status === "ready") {
      this.status = "running"
      this.startedAt = now
    }

    const expected = this.target[this.typed.length]
    if (expected === undefined) {
      this.finish(now)
      return false
    }

    this.typed += character
    this.totalKeypresses += 1
    if (character === expected) this.correctKeypresses += 1
    else this.mistakes += 1

    if (this.typed.length >= this.target.length) this.finish(now)
    return true
  }

  backspace(now = Date.now()): boolean {
    this.tick(now)
    if (this.status === "finished" || this.typed.length === 0) return false
    this.typed = this.typed.slice(0, -1)
    return true
  }

  tick(now = Date.now()): boolean {
    if (this.status !== "running" || this.startedAt === null) return false
    if (now - this.startedAt < this.durationMs) return false
    this.finish(this.startedAt + this.durationMs)
    return true
  }

  metrics(now = Date.now()): SessionMetrics {
    const end = this.endedAt ?? now
    const elapsedMs = this.startedAt === null
      ? 0
      : Math.min(this.durationMs, Math.max(0, end - this.startedAt))
    const elapsedMinutes = elapsedMs / 60_000
    const rawWpm = elapsedMinutes > 0
      ? Math.round(this.totalKeypresses / 5 / elapsedMinutes)
      : 0
    const wpm = elapsedMinutes > 0
      ? Math.round(this.correctKeypresses / 5 / elapsedMinutes)
      : 0
    const accuracy = this.totalKeypresses > 0
      ? (this.correctKeypresses / this.totalKeypresses) * 100
      : 100

    return {
      status: this.status,
      elapsedMs,
      remainingSeconds: Math.max(0, Math.ceil((this.durationMs - elapsedMs) / 1_000)),
      progress: Math.min(1, elapsedMs / this.durationMs),
      wpm,
      rawWpm,
      accuracy,
      correctKeypresses: this.correctKeypresses,
      mistakes: this.mistakes,
      totalKeypresses: this.totalKeypresses,
    }
  }

  private finish(now: number): void {
    this.status = "finished"
    this.endedAt = now
  }
}
