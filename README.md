# typ.ing

A calm, keyboard-first typing trainer that runs in your terminal. It includes timed word, quote, code, number, symbol, Readwise, and custom-text sessions with live WPM and accuracy feedback.

[npm](https://www.npmjs.com/package/typdoting) · [source](https://github.com/ViktorRonaldoStudio/typ.ing)

This is an unofficial community CLI and is not affiliated with ZSA Technology Labs or Readwise.

## Run it

OpenTUI currently requires [Bun 1.3 or newer](https://bun.sh). With Bun installed:

```sh
npx typdoting
```

You can also install it globally:

```sh
npm install --global typdoting
typ.ing
```

## Options

```text
-m, --mode <mode>   words, quotes, code, numbers, symbols,
                    readwise, or custom (default: words)
-l, --language <id> en, fr, de, es, javascript, typescript,
                    python, rust, or go
-t, --time <secs>   test duration from 5 to 300 (default: 30)
    --file <path>   practice a local UTF-8 text file
    --text <text>   practice supplied text
    --seed <number> deterministic text selection
-h, --help          show help
-v, --version       show the version
```

For example:

```sh
npx typdoting --mode code --time 60
npx typdoting --mode code --language rust --time 60
npx typdoting --mode words --language fr
npx typdoting --file ./chapter.txt
```

With no mode argument, the trainer opens a typ.ing-style options navigator: start typing a category name to filter the list, use `↑`/`↓` to move, and press `Enter` to select. Choose `duration` the same way to open the timing options. Press `/` while a test is idle to open the navigator again, or `Esc` to go back.

Inside the trainer, use `F1`–`F5` to quickly choose words/quotes/code/numbers/symbols and `F6`–`F9` to select 15/30/60/120 seconds before typing. Press `Ctrl+L` to connect Readwise without leaving the TUI, `Tab` to restart, `Escape` to reset, and `Ctrl+C` to quit. Explicit `--mode`, `--language`, `--file`, and `--text` arguments skip the navigator.

## Readwise

Like the original typ.ing website, the CLI can turn your Readwise highlights into personal typing practice. Connect once:

```sh
npx typdoting login
```

The login opens Readwise's access-token page, validates the token through Readwise's official API, and stores it in your user config with owner-only permissions. Then run:

```sh
npx typdoting --mode readwise
```

You can also press `Ctrl+L` while the trainer is open. Paste the token into the masked prompt and press `Enter`; the TUI validates it, saves it, loads your highlights, and switches directly to Readwise mode.

Use `typ.ing whoami` to check the connection or `typ.ing logout` to remove the saved token. You may provide `READWISE_TOKEN` instead of saving a token locally.

## Development

```sh
npm install
bun run check
bun test
bun run build
bun dist/cli.js
```

The typing engine and argument parser are separate from the UI so they can be tested without a terminal renderer.

## Publishing

After updating the version in `package.json` and `src/options.ts`:

```sh
npm login
npm publish
```

The package publishes the `typdoting`, `typ.ing`, and `typ-ing` executable aliases.

## License

MIT
