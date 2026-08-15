import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { ensureApiKey, getSettings } from './config';
import { GlmError, streamChatCompletion } from './glm';
import type { ChatMessage, FileContext, HostToWebviewMessage, WebviewToHostMessage } from './types';

const SYSTEM_PROMPT =
  'You are ZCode, a concise senior software engineer assistant embedded in the VS Code sidebar. ' +
  'Answer in the same language the user writes in. When code is needed, prefer complete, runnable snippets.';

function getNonce(): string {
  return crypto.randomBytes(24).toString('hex');
}

export class ZCodePanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewId = 'zcode.chat';

  private view?: vscode.WebviewView;
  private readonly disposables: vscode.Disposable[] = [];

  /** Full conversation, including context blocks embedded in user messages. */
  private history: ChatMessage[] = [];
  private contextFiles: FileContext[] = [];
  private controller?: AbortController;
  private streaming = false;

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [] };
    webviewView.webview.html = this.buildHtml(webviewView.webview);
    this.disposables.push(
      webviewView.webview.onDidReceiveMessage((msg) => this.handleMessage(msg as WebviewToHostMessage))
    );
    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
  }

  dispose(): void {
    this.controller?.abort();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }

  /** Command: zcode.clearChat */
  clearChat(): void {
    this.controller?.abort();
    this.history = [];
    this.contextFiles = [];
    this.post({ type: 'cleared' });
    this.postContext();
  }

  /** Command: zcode.exportChat — write the conversation to a markdown file. */
  async exportChat(): Promise<void> {
    if (this.history.length === 0) {
      vscode.window.showInformationMessage('ZCode: belum ada percakapan untuk diekspor.');
      return;
    }
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`zcode-chat-${stamp}.md`),
      filters: { 'Markdown': ['md'] },
      title: 'Export ZCode chat',
    });
    if (!target) {
      return;
    }
    const { model, baseUrl } = getSettings();
    const lines: string[] = [
      '# ZCode Chat Export',
      '',
      `- Date: ${now.toLocaleString()}`,
      `- Model: ${model}`,
      `- Base URL: ${baseUrl}`,
      '',
      '---',
      '',
    ];
    for (const msg of this.history) {
      if (msg.role === 'system') {
        continue;
      }
      lines.push(`## ${msg.role === 'user' ? '👤 You' : '🤖 Assistant'}`, '', msg.content, '');
    }
    try {
      await vscode.workspace.fs.writeFile(target, Buffer.from(lines.join('\n'), 'utf8'));
      vscode.window.showInformationMessage(`ZCode: chat diekspor ke ${target.fsPath}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`ZCode: gagal mengekspor chat (${reason}).`);
    }
  }

  /** Command: zcode.addFileContext — attach the active editor's content. */
  addFileContext(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('ZCode: tidak ada file aktif untuk dilampirkan.');
      return;
    }
    const name = vscode.workspace.asRelativePath(editor.document.uri, false);
    if (this.contextFiles.some((f) => f.name === name)) {
      vscode.window.showInformationMessage(`ZCode: ${name} sudah dilampirkan.`);
      return;
    }
    this.contextFiles.push({ name, content: editor.document.getText() });
    this.postContext();
    vscode.window.showInformationMessage(`ZCode: ${name} dilampirkan sebagai konteks.`);
  }

  private handleMessage(msg: WebviewToHostMessage): void {
    switch (msg.type) {
      case 'ready':
        this.postContext();
        this.post({ type: 'streaming', on: this.streaming });
        return;
      case 'send':
        void this.sendChat(msg.text);
        return;
      case 'stop':
        this.controller?.abort();
        return;
      case 'clear':
        this.clearChat();
        return;
      case 'removeContext':
        this.contextFiles = this.contextFiles.filter((f) => f.name !== msg.name);
        this.postContext();
        return;
    }
  }

  private async sendChat(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || this.streaming) {
      return;
    }

    const apiKey = await ensureApiKey();
    if (!apiKey) {
      this.post({
        type: 'error',
        text: 'Pesan tidak terkirim: API key belum diatur. Setel zcode.apiKey di Settings, atau kirim pesan lagi untuk memunculkan prompt input key.',
      });
      return;
    }

    const { baseUrl, model } = getSettings();
    const contextNames = this.contextFiles.map((f) => f.name);
    const contextBlock = this.buildContextBlock();
    const requestContent = contextBlock ? `${trimmed}\n\n${contextBlock}` : trimmed;

    this.history.push({ role: 'user', content: requestContent });
    this.post({ type: 'user', text: trimmed, contextFiles: contextNames });
    this.setStreaming(true);

    const hadContext = this.contextFiles.length > 0;
    this.controller = new AbortController();
    let streamed = '';

    try {
      await streamChatCompletion({
        baseUrl,
        model,
        apiKey,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...this.history],
        signal: this.controller.signal,
        onDelta: (delta) => {
          streamed += delta;
          this.post({ type: 'delta', text: delta });
        },
      });
      this.history.push({ role: 'assistant', content: streamed || '(model tidak mengembalikan teks)' });
    } catch (err) {
      const e = err instanceof GlmError ? err : new GlmError('http', err instanceof Error ? err.message : String(err));
      // Keep any partial answer that arrived before the error/abort.
      if (streamed) {
        this.history.push({ role: 'assistant', content: streamed });
      }
      this.post({ type: 'error', text: e.message });
    } finally {
      this.controller = undefined;
      this.setStreaming(false);
      this.post({ type: 'done' });
      if (hadContext) {
        // Context is consumed together with the message it was attached to.
        this.contextFiles = [];
        this.postContext();
      }
    }
  }

  private buildContextBlock(): string {
    if (this.contextFiles.length === 0) {
      return '';
    }
    const parts = this.contextFiles.map((f) => `[Attached file: ${f.name}]\n${f.content}`);
    return `# Attached file context\n\n${parts.join('\n\n')}`;
  }

  private setStreaming(on: boolean): void {
    this.streaming = on;
    this.post({ type: 'streaming', on });
  }

  private postContext(): void {
    this.post({ type: 'context', files: this.contextFiles.map((f) => f.name) });
  }

  private post(msg: HostToWebviewMessage): void {
    void this.view?.webview.postMessage(msg);
  }

  private buildHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} https: data:`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    display: flex;
    flex-direction: column;
    height: 100vh;
    margin: 0;
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background, transparent);
  }
  #context-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,.25));
    min-height: 0;
  }
  #context-bar:empty { display: none; }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
  }
  .chip button {
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
    font-size: 11px;
  }
  #messages {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }
  .empty {
    opacity: .6;
    padding: 16px 8px;
    text-align: center;
    font-size: 12px;
  }
  .msg {
    margin: 6px 0;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.5;
  }
  .msg .meta {
    font-size: 10px;
    opacity: .7;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: .05em;
  }
  .msg .content {
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  .msg.user {
    background: var(--vscode-input-background);
  }
  .msg.assistant {
    border-left: 2px solid var(--vscode-focusBorder);
  }
  .msg.streaming .content::after {
    content: '\\258D';
    animation: blink 1s steps(2) infinite;
  }
  @keyframes blink { 50% { opacity: 0; } }
  .msg.error {
    border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100);
    background: var(--vscode-inputValidation-errorBackground, rgba(190,17,0,.08));
    color: var(--vscode-errorForeground);
  }
  #composer {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border-top: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,.25));
  }
  #input {
    resize: vertical;
    min-height: 44px;
    max-height: 180px;
    font-family: inherit;
    font-size: 13px;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 6px;
    padding: 6px 8px;
    outline: none;
  }
  #input:focus { border-color: var(--vscode-focusBorder); }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  .actions button {
    font-size: 12px;
    border: none;
    border-radius: 4px;
    padding: 4px 14px;
    cursor: pointer;
  }
  #send {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  #send:hover { background: var(--vscode-button-hoverBackground); }
  #send:disabled { opacity: .5; cursor: default; }
  #stop {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
</style>
</head>
<body>
  <div id="context-bar"></div>
  <div id="messages">
    <div id="empty" class="empty">Tanya apa saja soal kode Anda.<br>Pesan dikirim ke model GLM via streaming.</div>
  </div>
  <form id="composer">
    <textarea id="input" rows="2" placeholder="Tulis pesan… (Enter kirim, Shift+Enter baris baru)"></textarea>
    <div class="actions">
      <button type="button" id="stop" hidden>Stop</button>
      <button type="submit" id="send">Kirim</button>
    </div>
  </form>
<script nonce="${nonce}">
(function () {
  'use strict';
  var vscode = acquireVsCodeApi();
  var messagesEl = document.getElementById('messages');
  var contextBar = document.getElementById('context-bar');
  var form = document.getElementById('composer');
  var input = document.getElementById('input');
  var sendBtn = document.getElementById('send');
  var stopBtn = document.getElementById('stop');
  var streaming = false;
  var current = null; // content element of the in-progress assistant message

  function hideEmpty() {
    var el = document.getElementById('empty');
    if (el) { el.remove(); }
  }

  function restoreEmpty() {
    var el = document.createElement('div');
    el.id = 'empty';
    el.className = 'empty';
    el.innerHTML = 'Tanya apa saja soal kode Anda.<br>Pesan dikirim ke model GLM via streaming.';
    messagesEl.appendChild(el);
  }

  function nearBottom() {
    return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 60;
  }

  function scrollDown(force) {
    if (force || nearBottom()) { messagesEl.scrollTop = messagesEl.scrollHeight; }
  }

  function addMessage(cls, meta, text) {
    hideEmpty();
    var div = document.createElement('div');
    div.className = 'msg ' + cls;
    var m = document.createElement('div');
    m.className = 'meta';
    m.textContent = meta;
    var c = document.createElement('div');
    c.className = 'content';
    c.textContent = text;
    div.appendChild(m);
    div.appendChild(c);
    messagesEl.appendChild(div);
    scrollDown(true);
    return div;
  }

  function renderContext(files) {
    contextBar.innerHTML = '';
    (files || []).forEach(function (name) {
      var chip = document.createElement('span');
      chip.className = 'chip';
      var label = document.createElement('span');
      label.textContent = '\\uD83D\\uDCC1 ' + name;
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.title = 'Hapus konteks';
      rm.textContent = '\\u2715';
      rm.addEventListener('click', function () {
        vscode.postMessage({ type: 'removeContext', name: name });
      });
      chip.appendChild(label);
      chip.appendChild(rm);
      contextBar.appendChild(chip);
    });
  }

  function setStreaming(on) {
    streaming = on;
    sendBtn.disabled = on;
    stopBtn.hidden = !on;
    if (!on && current) {
      current.classList.remove('streaming');
      current = null;
    }
  }

  window.addEventListener('message', function (ev) {
    var m = ev.data;
    if (!m || !m.type) { return; }
    switch (m.type) {
      case 'user': {
        var div = addMessage('user', 'You', m.text);
        if (m.contextFiles && m.contextFiles.length > 0) {
          var note = document.createElement('div');
          note.className = 'meta';
          note.textContent = '\\uD83D\\uDCC1 ' + m.contextFiles.join(', ');
          div.appendChild(note);
        }
        break;
      }
      case 'delta': {
        if (!current) {
          hideEmpty();
          var d = document.createElement('div');
          d.className = 'msg assistant streaming';
          var meta = document.createElement('div');
          meta.className = 'meta';
          meta.textContent = 'Assistant';
          current = document.createElement('div');
          current.className = 'content';
          d.appendChild(meta);
          d.appendChild(current);
          messagesEl.appendChild(d);
        }
        current.textContent += m.text;
        scrollDown(false);
        break;
      }
      case 'done':
        setStreaming(false);
        break;
      case 'streaming':
        setStreaming(m.on);
        break;
      case 'error':
        addMessage('error', 'Error', m.text);
        setStreaming(false);
        break;
      case 'cleared':
        messagesEl.innerHTML = '';
        current = null;
        restoreEmpty();
        break;
      case 'context':
        renderContext(m.files);
        break;
    }
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || streaming) { return; }
    vscode.postMessage({ type: 'send', text: text });
    input.value = '';
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  stopBtn.addEventListener('click', function () {
    vscode.postMessage({ type: 'stop' });
  });

  vscode.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
  }
}
