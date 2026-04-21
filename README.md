# Stream Deck Claude Usage

An Elgato Stream Deck plugin that shows your [Claude](https://claude.ai) Max plan usage at a glance. The button background changes colour based on how close you are to your limits.

- **Green**: < 50% usage
- **Amber**: 50-79% usage
- **Red**: 80%+ usage

Displays both 5-hour session and 7-day rolling usage. Polls every 30 seconds. Press the button to refresh immediately.

![Stream Deck Claude Usage](docs/preview.png)

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated (the plugin reads the OAuth token from `~/.claude/.credentials.json`)
- Claude Max plan (Pro plan doesn't have the usage endpoint)
- Stream Deck software v6.6+
- Node.js 20+

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

**macOS:**

```bash
ln -s "$(pwd)/com.jamesrose.claude-usage.sdPlugin" \
  ~/Library/Application\ Support/com.elgato.StreamDeck/Plugins/com.jamesrose.claude-usage.sdPlugin
```

### 4. Restart Stream Deck

Quit and reopen the Stream Deck app, then drag the **Claude Usage** action onto a button.

## How it works

The plugin reads your Claude Code OAuth token from `~/.claude/.credentials.json` and calls the Anthropic usage API to get your current utilisation percentages. No API key needed, no extra auth - it piggybacks on your existing Claude Code session.

The token refreshes automatically when you use Claude Code. If the token expires (typically after 8-12 hours of inactivity), the button will show "Refresh" until you run a Claude Code command.

## Notes

- Uses an undocumented Anthropic API endpoint (`/api/oauth/usage`) - it could change or break at any time
- The OAuth token is read-only from disk; the plugin never writes to your credentials file

## License

MIT
