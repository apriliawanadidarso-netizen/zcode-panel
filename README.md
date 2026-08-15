# ZCode Panel for VS Code

Chat sidebar untuk VS Code yang terhubung ke **GLM Coding Plan (Z.ai)** dengan respons streaming (SSE, OpenAI-compatible). Dibangun dengan TypeScript + webview polos tanpa framework, tanpa dependency runtime.

> 📷 **Screenshot placeholder** — panel chat ZCode di sidebar VS Code (dokumentasikan di `docs/screenshot.png` saat dipublikasikan).

## Fitur

- **Panel chat "ZCode" di Activity Bar** — input chat + output streaming real-time (delta per token).
- **Konfigurasi via settings** — `zcode.baseUrl`, `zcode.model`, `zcode.apiKey`. API key tidak pernah di-hardcode; bila kosong, Anda akan diprompt sekali saat pertama mengirim pesan dan key disimpan ke user settings.
- **Commands**
  - `ZCode: Open Panel` — buka/fokus panel chat.
  - `ZCode: Clear Chat` — kosongkan percakapan.
  - `ZCode: Export Chat to Markdown` — simpan seluruh percakapan ke file `.md`.
  - `ZCode: Attach Active File as Context` — lampirkan isi file di editor aktif sebagai konteks pesan berikutnya (chip konteks muncul di panel, bisa dihapus satu per satu, otomatis terkonsumsi setelah pesan terkirim).
- **Status bar item** — menampilkan model aktif (mis. `glm-5.3`); klik untuk membuka panel.
- **Error handling di panel** — API key invalid (401/403), rate limit (429), kegagalan jaringan, dan error HTTP lain ditampilkan sebagai pesan error yang jelas di dalam panel, bukan hanya di konsol. Tombol **Stop** tersedia saat streaming.

## Cara pakai

1. Install extension (dari `.vsix`: `code --install-extension zcode-panel-0.1.0.vsix`).
2. Klik ikon **ZCode** di Activity Bar (atau jalankan `ZCode: Open Panel`).
3. Saat pertama mengirim pesan, masukkan API key GLM Coding Plan Anda — key disimpan di setting `zcode.apiKey`.
4. (Opsional) Buka file, jalankan `ZCode: Attach Active File as Context`, lalu kirim pertanyaan tentang file tersebut.

## Konfigurasi

| Setting | Default | Keterangan |
| --- | --- | --- |
| `zcode.baseUrl` | `https://api.z.ai/api/coding/paas/v4` | Base URL endpoint OpenAI-compatible. |
| `zcode.model` | `glm-5.3` | ID model (context window 1.000.000 token). |
| `zcode.apiKey` | _(kosong)_ | API key Z.ai; dikosongkan akan memunculkan prompt saat pertama dipakai. |

## Pengembangan

```bash
npm install
npm run compile        # tsc → out/
# F5 di VS Code (konfigurasi launch "Run ZCode Panel Extension") untuk Extension Development Host
npm run package        # compile + vsce package → .vsix
```

Struktur singkat: `src/extension.ts` (aktivasi, commands, status bar), `src/panel.ts` (webview provider + state chat), `src/glm.ts` (klien streaming SSE via `fetch` + `ReadableStream`), `src/config.ts` (settings + prompt API key).
