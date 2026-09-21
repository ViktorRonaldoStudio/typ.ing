import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { connectReadwise, fetchReadwiseHighlights, validateReadwiseToken } from "../src/account.js"

function responseFetcher(body: unknown, status = 200) {
  return async () => new Response(
    status === 204 ? null : JSON.stringify(body),
    { status, headers: { "content-type": "application/json" } },
  )
}

describe("Readwise account integration", () => {
  test("validates tokens using the documented auth status", async () => {
    expect(await validateReadwiseToken("token", responseFetcher(null, 204))).toBe(true)
    expect(await validateReadwiseToken("bad", responseFetcher({}, 401))).toBe(false)
  })

  test("normalizes and filters highlight text", async () => {
    const highlights = await fetchReadwiseHighlights("token", responseFetcher({
      results: [
        { text: "  A long enough\nReadwise highlight for practice. " },
        { text: "short" },
        { text: null },
      ],
    }))

    expect(highlights).toEqual(["A long enough Readwise highlight for practice."])
  })

  test("reports rejected account tokens", async () => {
    expect(fetchReadwiseHighlights("bad", responseFetcher({}, 401))).rejects.toThrow("login")
  })

  test("validates and stores a token for both CLI and in-app login", async () => {
    const directory = await mkdtemp(join(tmpdir(), "typdoting-account-"))
    const path = join(directory, "account.json")
    try {
      expect(await connectReadwise("  secret-token  ", responseFetcher(null, 204), path))
        .toBe("secret-token")
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ readwiseToken: "secret-token" })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
