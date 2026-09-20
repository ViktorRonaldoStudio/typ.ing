import { describe, expect, test } from "bun:test"

import { fetchReadwiseHighlights, validateReadwiseToken } from "../src/account.js"

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
})
