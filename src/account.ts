import { spawn } from "node:child_process"
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export const READWISE_TOKEN_URL = "https://readwise.io/access_token"
const AUTH_URL = "https://readwise.io/api/v2/auth/"
const HIGHLIGHTS_URL = "https://readwise.io/api/v2/highlights/?page_size=1000"

interface AccountConfig {
  readwiseToken?: string
}

interface ReadwiseHighlightsResponse {
  results?: Array<{ text?: unknown }>
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export function accountPath(): string {
  const base = process.env.TYPDOTING_CONFIG_DIR
    ?? process.env.XDG_CONFIG_HOME
    ?? join(homedir(), ".config")
  return join(base, "typdoting", "account.json")
}

async function readConfig(path = accountPath()): Promise<AccountConfig> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as AccountConfig
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}
    throw error
  }
}

async function writeConfig(config: AccountConfig, path = accountPath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
  await chmod(path, 0o600)
}

export async function savedReadwiseToken(path = accountPath()): Promise<string | null> {
  const token = (await readConfig(path)).readwiseToken?.trim()
  return token || null
}

export async function validateReadwiseToken(token: string, fetcher: Fetcher = fetch): Promise<boolean> {
  const response = await fetcher(AUTH_URL, {
    headers: { Authorization: `Token ${token}` },
  })
  return response.status === 204
}

export async function fetchReadwiseHighlights(
  token: string,
  fetcher: Fetcher = fetch,
): Promise<string[]> {
  const response = await fetcher(HIGHLIGHTS_URL, {
    headers: { Authorization: `Token ${token}` },
  })
  if (response.status === 401 || response.status === 403) {
    throw new Error("Readwise rejected the saved token. Run 'typ.ing login' again.")
  }
  if (!response.ok) {
    throw new Error(`Readwise request failed with status ${response.status}`)
  }

  const body = await response.json() as ReadwiseHighlightsResponse
  return (body.results ?? [])
    .map(({ text }) => typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "")
    .filter((text) => text.length >= 20)
}

export function openReadwiseTokenPage(): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open"
  const args = process.platform === "win32" ? ["/c", "start", "", READWISE_TOKEN_URL] : [READWISE_TOKEN_URL]
  const child = spawn(command, args, { detached: true, stdio: "ignore" })
  child.on("error", () => {})
  child.unref()
}

export async function connectReadwise(
  token: string,
  fetcher: Fetcher = fetch,
  path = accountPath(),
): Promise<string> {
  const normalizedToken = token.trim()
  if (!normalizedToken) throw new Error("No token provided")
  if (!await validateReadwiseToken(normalizedToken, fetcher)) {
    throw new Error("Readwise did not accept that token")
  }
  await writeConfig({ readwiseToken: normalizedToken }, path)
  return normalizedToken
}

async function promptSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error("Interactive login needs a terminal. Set READWISE_TOKEN and run 'typ.ing login'.")
  }

  process.stdout.write(prompt)
  process.stdin.setEncoding("utf8")
  process.stdin.setRawMode(true)
  process.stdin.resume()

  return await new Promise<string>((resolve, reject) => {
    let value = ""
    const finish = (error?: Error) => {
      process.stdin.off("data", onData)
      process.stdin.setRawMode?.(false)
      process.stdin.pause()
      process.stdout.write("\n")
      if (error) reject(error)
      else resolve(value.trim())
    }
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          finish(new Error("Login cancelled"))
          return
        }
        if (character === "\r" || character === "\n") {
          finish()
          return
        }
        if (character === "\u007f" || character === "\b") {
          if (value) {
            value = value.slice(0, -1)
            process.stdout.write("\b \b")
          }
          continue
        }
        if (character >= " ") {
          value += character
          process.stdout.write("•")
        }
      }
    }
    process.stdin.on("data", onData)
  })
}

export async function loginReadwise(): Promise<void> {
  const environmentToken = process.env.READWISE_TOKEN?.trim()
  if (!environmentToken) {
    console.log(`Opening ${READWISE_TOKEN_URL}`)
    openReadwiseTokenPage()
  }
  const token = environmentToken || await promptSecret("Paste your Readwise access token: ")
  await connectReadwise(token)
  console.log("Readwise connected. Try: typ.ing --mode readwise")
}

export async function logoutReadwise(path = accountPath()): Promise<boolean> {
  try {
    await unlink(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

export async function readwiseStatus(): Promise<string> {
  const token = process.env.READWISE_TOKEN?.trim() ?? await savedReadwiseToken()
  if (!token) return "Readwise is not connected. Run: typ.ing login"
  try {
    return await validateReadwiseToken(token)
      ? "Readwise is connected."
      : "The saved Readwise token is invalid. Run: typ.ing login"
  } catch {
    return "A Readwise token is saved, but its status could not be checked."
  }
}
