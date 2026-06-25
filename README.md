# Stream Deck Claude Usage

An Elgato Stream Deck plugin that shows your [Claude](https://claude.ai) Max plan usage at a glance. The button background changes colour based on how close you are to your limits.

- **Green**: < 50% usage
- **Amber**: 50-79% usage
- **Red**: 80%+ usage

Displays both 5-hour session and 7-day rolling usage, plus when the 5-hour window resets. Polls every 2 minutes (the usage data barely moves faster than that, and the endpoint is heavily rate-limited). Press the button to refresh immediately.

![Stream Deck Claude Usage](docs/preview.png)

## Requirements

- **Claude Max plan** (5x or 20x). The usage API endpoint is not available on Pro or Free plans.
- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** installed and authenticated. The plugin reads the OAuth token that Claude Code stores locally.
- Stream Deck software v6.6+
- Node.js 20+

## How authentication works

This plugin does **not** use an API key or ask you to log in. Instead, it piggybacks on your existing Claude Code authentication.

When you sign in to Claude Code (via `claude` in your terminal), it stores an OAuth token at `~/.claude/.credentials.json`. The plugin reads this token from disk and uses it to call the Anthropic usage API. The token is only ever sent over HTTPS to `api.anthropic.com`.

**Important**: The OAuth token expires after roughly 8-12 hours. Claude Code automatically refreshes it whenever you use it. If the token expires (e.g. you haven't used Claude Code overnight), the button will show "Refresh / Claude" until you run any Claude Code command, which refreshes the token.

The plugin never writes to your credentials file. It is strictly read-only.

## Installation

### 1. Clone the repo

```bash
git clone https://github.com/jimmyrose/streamdeck-claude-usage.git
cd streamdeck-claude-usage
```

### 2. Build

```bash
cd com.jamesrose.claude-usage.sdPlugin
npm install
npm run build
cd ..
```

### 3. Link to Stream Deck

**Windows (PowerShell as Admin):**

```powershell
New-Item -ItemType SymbolicLink `
  -Path "$env:APPDATA\Elgato\StreamDeck\Plugins\com.jamesrose.claude-usage.sdPlugin" `
  -Target (Resolve-Path ".\com.jamesrose.claude-usage.sdPlugin").Path
```

If you don't have admin access, use a junction instead (no elevation required):

```powershell
New-Item -ItemType Junction `
  -Path "$env:APPDATA\Elgato\StreamDeck\Plugins\com.jamesrose.claude-usage.sdPlugin" `
  -Target (Resolve-Path ".\com.jamesrose.claude-usage.sdPlugin").Path
```

**macOS:**

```bash
ln -s "$(pwd)/com.jamesrose.claude-usage.sdPlugin" \
  ~/Library/Application\ Support/com.elgato.StreamDeck/Plugins/com.jamesrose.claude-usage.sdPlugin
```

### 4. Restart Stream Deck

Quit and reopen the Stream Deck app, then drag the **Claude Usage** action onto a button.

## Error handling

The usage endpoint returns HTTP 429 (rate limited) on a large share of requests. The plugin handles this with **exponential backoff**: when a poll fails it doubles the wait (2 min → 4 → 8 ... capped at 30 min) so it stops hammering the endpoint; any success (or a button press) resets it back to the 2-minute cadence. While polls are failing the button keeps showing the last good reading for up to 6 minutes, then goes grey so a genuine outage is obvious.

## Usage cache (shared with the `/claude-usage` skill)

On every successful poll the plugin writes its last-good reading to `~/.claude/usage-cache.json`:

```json
{ "fetched_at": "<ISO>", "five_hour": { "utilization": 47, "resets_at": "..." }, "seven_day": { "utilization": 22, "resets_at": "..." } }
```

This lets other tools (e.g. a CLI usage check that gates long-running work) read current usage from disk instead of each hammering the rate-limited API. The file is best-effort: a failed write never affects the display.

## Notes

- Uses an undocumented Anthropic API endpoint (`/api/oauth/usage`). It could change or break at any time.
- The OAuth token is read from disk on every poll. The plugin never caches, stores, or transmits it anywhere other than directly to `api.anthropic.com` over HTTPS.

## License

MIT
