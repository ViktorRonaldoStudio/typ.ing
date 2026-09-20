#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { helpText, OptionError, parseOptions, VERSION } from "./options.js"

async function main(): Promise<void> {
  let options
  try {
    options = parseOptions(process.argv.slice(2))
  } catch (error) {
    if (error instanceof OptionError) {
      console.error(`typ.ing: ${error.message}\nTry 'typ.ing --help' for usage.`)
      process.exitCode = 1
      return
    }
    throw error
  }

  if (options.help) {
    console.log(helpText())
    return
  }

  if (options.version) {
    console.log(VERSION)
    return
  }

  if (options.command !== "train") {
    const { loginReadwise, logoutReadwise, readwiseStatus } = await import("./account.js")
    try {
      if (options.command === "login") await loginReadwise()
      if (options.command === "logout") {
        console.log(await logoutReadwise() ? "Readwise disconnected." : "Readwise was not connected.")
      }
      if (options.command === "whoami") console.log(await readwiseStatus())
    } catch (error) {
      console.error(`typ.ing: ${error instanceof Error ? error.message : String(error)}`)
      process.exitCode = 1
    }
    return
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("typ.ing needs an interactive terminal.")
    process.exitCode = 1
    return
  }

  const bunVersion = process.versions.bun
  if (!bunVersion) {
    const child = spawnSync(
      "bun",
      [fileURLToPath(import.meta.url), ...process.argv.slice(2)],
      { stdio: "inherit" },
    )

    if (child.error) {
      console.error("typ.ing requires Bun 1.3 or newer. Install it from https://bun.sh")
      process.exitCode = 1
      return
    }

    process.exitCode = child.status ?? 1
    return
  }

  const [major = 0, minor = 0] = bunVersion.split(".").map(Number)
  if (major < 1 || (major === 1 && minor < 3)) {
    console.error(`typ.ing requires Bun 1.3 or newer (found ${bunVersion}).`)
    process.exitCode = 1
    return
  }

  const { runApp } = await import("./app.js")
  try {
    await runApp(options)
  } catch (error) {
    console.error(`typ.ing: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

await main()
