import * as vscode from 'vscode';
import { getSettings } from './config';
import { ZCodePanelProvider } from './panel';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ZCodePanelProvider();

  // Status bar item: shows the active model, click opens the panel.
  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.name = 'ZCode';
  statusItem.command = 'zcode.openPanel';
  const refreshStatus = (): void => {
    const { model, apiKey } = getSettings();
    statusItem.text = `$(sparkle) ${model}`;
    statusItem.tooltip = `ZCode — model aktif: ${model} (key: ${apiKey ? 'ter set' : 'belum diatur'}). Klik untuk membuka panel.`;
  };
  refreshStatus();
  statusItem.show();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ZCodePanelProvider.viewId, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('zcode.openPanel', () => {
      void vscode.commands.executeCommand('zcode.chat.focus');
    }),
    vscode.commands.registerCommand('zcode.clearChat', () => provider.clearChat()),
    vscode.commands.registerCommand('zcode.exportChat', () => void provider.exportChat()),
    vscode.commands.registerCommand('zcode.addFileContext', () => provider.addFileContext()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('zcode')) {
        refreshStatus();
      }
    }),
    statusItem,
    provider
  );
}

export function deactivate(): void {
  // Nothing to clean up beyond context.subscriptions.
}
