# typ.ing

A calm, keyboard-first typing trainer that runs entirely in your terminal. It includes timed word, quote, and code sessions with live WPM and accuracy feedback.

[npm](https://www.npmjs.com/package/typdoting) · [source](https://github.com/ViktorRonaldoStudio/typ.ing)

## Run it

OpenTUI currently requires [Bun 1.3 or newer](https://bun.sh). With Bun installed:

```sh
npx typdoting
```

You can also install it globally:

```sh
npm install --global typ.ing
typ.ing
```

## Options

```text
-m, --mode <mode>   words, quotes, or code (default: words)
-t, --time <secs>   test duration from 5 to 300 (default: 30)
    --seed <number> deterministic text selection
-h, --help          show help
-v, --version       show the version
```

For example:

```sh
npx typdoting --mode code --time 60
```

Inside the trainer, use `Ctrl+1`–`Ctrl+3` to choose a mode and `Ctrl+A`/`Ctrl+S`/`Ctrl+D`/`Ctrl+F` to select 15/30/60/120 seconds before typing. Press `Tab` to restart, `Escape` to reset, and `Ctrl+C` to quit.

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
