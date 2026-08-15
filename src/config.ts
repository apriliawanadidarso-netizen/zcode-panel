import * as vscode from 'vscode';

export const DEFAULT_BASE_URL = 'https://api.z.ai/api/coding/paas/v4';
export const DEFAULT_MODEL = 'glm-5.3';

export interface ZCodeSettings {
  baseUrl: string;
  model: string;
  apiKey: string;
}

/** Read the `zcode.*` contribution settings with safe fallbacks. */
export function getSettings(): ZCodeSettings {
  const config = vscode.workspace.getConfiguration('zcode');
  return {
    baseUrl: (config.get<string>('baseUrl') || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    model: config.get<string>('model') || DEFAULT_MODEL,
    apiKey: (config.get<string>('apiKey') || '').trim(),
  };
}

/**
 * Return the stored API key, prompting (and persisting) on first use.
 * Returns undefined when the user dismisses the prompt or enters nothing.
 */
export async function ensureApiKey(): Promise<string | undefined> {
  const { apiKey } = getSettings();
  if (apiKey) {
    return apiKey;
  }

  const entered = await vscode.window.showInputBox({
    password: true,
    ignoreFocusOut: true,
    placeHolder: 'Z.ai API key (e.g. xxxxxxxx.xxxxxxxxxxxx)',
    prompt: 'API key for the GLM Coding Plan is not set yet. Enter it to continue.',
  });
  if (!entered || !entered.trim()) {
    return undefined;
  }

  const key = entered.trim();
  try {
    await vscode.workspace
      .getConfiguration('zcode')
      .update('apiKey', key, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage('ZCode: API key saved to user settings (zcode.apiKey).');
  } catch {
    vscode.window.showWarningMessage(
      'ZCode: could not persist the API key to settings — using it for this session only.'
    );
  }
  return key;
}
