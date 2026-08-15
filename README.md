# ZCode Panel for VS Code

A VS Code sidebar chat connected to the **GLM Coding Plan (Z.ai)** with streaming responses (SSE, OpenAI-compatible). Built with TypeScript and a plain webview — no framework, no runtime dependencies.

> 📷 **Screenshot placeholder** — the ZCode chat panel in the VS Code sidebar (document it in `docs/screenshot.png` when publishing).

## Features

- **"ZCode" chat panel in the Activity Bar** — chat input with real-time streaming output (token by token).
- **Settings-driven configuration** — `zcode.baseUrl`, `zcode.model`, `zcode.apiKey`. The API key is never hardcoded; if it is empty, you are prompted once on your first message and the key is saved to your user settings.
- **Commands**
  - `ZCode: Open Panel` — open/focus the chat panel.
  - `ZCode: Clear Chat` — clear the conversation.
  - `ZCode: Export Chat to Markdown` — save the whole conversation to a `.md` file.
  - `ZCode: Attach Active File as Context` — attach the contents of the active editor file as context for your next message (context chips appear in the panel, can be removed individually, and are consumed automatically once the message is sent).
- **Status bar item** — shows the active model (e.g. `glm-5.3`); click it to open the panel.
- **In-panel error handling** — invalid API key (401/403), rate limit (429), network failures, and other HTTP errors are shown as clear error messages inside the panel, not just in the console. A **Stop** button is available while streaming.

## Usage

1. Install the extension (from the `.vsix`: `code --install-extension zcode-panel-0.1.0.vsix`).
2. Click the **ZCode** icon in the Activity Bar (or run `ZCode: Open Panel`).
3. When sending your first message, enter your GLM Coding Plan API key — it is stored in the `zcode.apiKey` setting.
4. (Optional) Open a file, run `ZCode: Attach Active File as Context`, then ask a question about that file.

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `zcode.baseUrl` | `https://api.z.ai/api/coding/paas/v4` | Base URL of the OpenAI-compatible endpoint. |
| `zcode.model` | `glm-5.3` | Model ID (1,000,000-token context window). |
| `zcode.apiKey` | _(empty)_ | Z.ai API key; when empty, a prompt appears on first use. |

## Development

```bash
npm install
npm run compile        # tsc → out/
# Press F5 in VS Code ("Run ZCode Panel Extension" launch config) for the Extension Development Host
npm run package        # compile + vsce package → .vsix
```

Brief structure: `src/extension.ts` (activation, commands, status bar), `src/panel.ts` (webview provider + chat state), `src/glm.ts` (SSE streaming client via `fetch` + `ReadableStream`), `src/config.ts` (settings + API key prompt).
