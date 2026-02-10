# OpenAI Codex OAuth (Milaidy / ElizaOS)

This is a Milaidy plugin that enables **OpenAI Codex subscription OAuth** (ChatGPT/Codex-style auth) for **text models**.

It is designed to be:
- **opt-in** (disabled unless explicitly enabled)
- **text-only** (TEXT_SMALL / TEXT_LARGE)
- minimally invasive to Milaidy

> Note: The runtime integration is still under active development. The OAuth **login script** is the recommended way to obtain credentials right now.

---

## 1) One-time login (recommended): paste-only script

Run the login script (it will print an OpenAI auth URL in the terminal, then ask you to paste the final redirect URL):

```bash
cd /Users/robin/Projects/milaidy-agenttown/plugins/plugin-openai-codex-oauth/typescript
node scripts/codex-login.mjs
```

### What you paste
After you complete auth in the browser, copy the **final redirect URL** from the browser address bar and paste it into the script.

- The pasted URL must contain `code=` (and usually `state=`).
- If you paste the wrong URL (or press enter), you’ll get an error like `Missing authorization code`.

### Where credentials are stored
The script writes OAuth credentials to:

- `~/.milaidy/credentials/oauth.json`

Under the provider key:

- `openai-codex`

---

## 2) Starting Milaidy with the provider enabled

Milaidy loads this as an AI provider plugin when you set:

```bash
OPENAI_CODEX_OAUTH=true
```

Example:

```bash
OPENAI_CODEX_OAUTH=true \
MILAIDY_PORT=19002 \
pnpm start
```

Optional (debug logging):

```bash
LOG_LEVEL=debug OPENAI_CODEX_OAUTH=true MILAIDY_PORT=19002 pnpm start
```

---

## 3) Common issues / troubleshooting

### `Missing authorization code`
You pasted an incorrect redirect URL.
- Re-run the script and paste the final URL containing `code=`.

### `EADDRINUSE` / callback binding errors
Some OAuth flows try to bind a localhost callback port.
- This plugin’s `codex-login.mjs` script uses **paste-only mode** specifically to avoid local port conflicts.

### Credentials file not created
Ensure the directory exists and is writable:

```bash
mkdir -p ~/.milaidy/credentials
```

Then re-run the login script.

---

## Status

- OAuth login: implemented via `scripts/codex-login.mjs` (paste-only)
- Milaidy provider wiring: enabled via `OPENAI_CODEX_OAUTH=true`
- TEXT_SMALL/TEXT_LARGE runtime behavior: still being stabilized (stubs + integration in progress)
