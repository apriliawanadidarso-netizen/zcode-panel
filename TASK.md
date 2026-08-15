# TASK: ZCode VS Code Extension

**Goal:** Bangun VS Code extension (TypeScript) — "ZCode Panel for VS Code": panel chat di sidebar VS Code yang terhubung ke GLM Coding Plan (Z.ai), plus alur publish ke VS Code Marketplace.

## Spesifikasi fitur
1. **Sidebar Webview Panel "ZCode"** — chat input + streaming output (SSE / OpenAI-compatible streaming).
2. **Konfigurasi** via VS Code settings (`zcode.baseUrl`, `zcode.model`, `zcode.apiKey`):
   - Base URL default: `https://api.z.ai/api/coding/paas/v4`
   - Model default: `glm-5.3` (context window 1.000.000)
   - API key TIDAK boleh hardcode — baca dari `configuration.get`; kalau kosong, prompt pertama kali (inputBox) + simpan ke settings.
3. **Commands:** `zcode.openPanel` · `zcode.clearChat` · `zcode.exportChat` (simpan chat ke file markdown).
4. **Status bar item** — menampilkan model aktif; klik → buka panel.
5. **Konteks file aktif** — command `zcode.addFileContext`: lampirkan isi file editor aktif sebagai konteks pesan.
6. **Error handling** — invalid API key, network error, rate limit: tampilkan pesan yang jelas di panel (bukan cuma konsol).

## Tech stack
- TypeScript + VS Code API (engines vscode >= 1.90.0).
- Webview polos (HTML/CSS/JS) — tanpa framework.
- Dependencies minimal; streaming pakai `fetch` + ReadableStream.
- Build & package: `npm install`, `npm run compile`, `vsce package` → `.vsix`.

## Deliverables
1. Source lengkap (src/, package.json, tsconfig.json, .vscode/launch.json, README.md).
2. `package.json` benar: `main`, `activationEvents`, `contributes.commands`, `contributes.viewsContainers`, `contributes.views`, `contributes.configuration`.
3. README.md dengan deskripsi, screenshot placeholder, cara pakai.
4. Verifikasi: compile bersih (`npm run compile` tanpa error) + `vsce package` menghasilkan `.vsix`.

## Catatan
- Ini extension orisinal buat ZCode/GLM — bukan copy extension lain.
- Fokus kualitas kode: rapi, berkomentar singkat, handle async error.
- Kerjakan sampai deliverable 4 selesai; kalau vsce belum terinstall, install dulu (`npm install -g @vscode/vsce` atau `npx @vscode/vsce package`).
