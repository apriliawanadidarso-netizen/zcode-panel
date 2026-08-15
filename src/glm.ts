import type { ChatMessage } from './types';

/** Error categories that map to distinct user-facing messages in the panel. */
export type GlmErrorKind = 'auth' | 'rateLimit' | 'network' | 'http' | 'aborted';

export class GlmError extends Error {
  constructor(
    public readonly kind: GlmErrorKind,
    message: string
  ) {
    super(message);
    this.name = 'GlmError';
  }
}

export interface StreamChatOptions {
  baseUrl: string;
  model: string;
  apiKey: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  /** Called for every streamed text chunk. */
  onDelta: (delta: string) => void;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function excerpt(body: string, max = 300): string {
  const trimmed = body.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function mapHttpError(status: number, body: string): GlmError {
  const detail = excerpt(body);
  switch (status) {
    case 401:
    case 403:
      return new GlmError(
        'auth',
        `API key tidak valid atau ditolak server (HTTP ${status}). Periksa zcode.apiKey. ${detail}`
      );
    case 429:
      return new GlmError(
        'rateLimit',
        `Rate limit tercapai (HTTP 429). Tunggu sebentar lalu kirim ulang pesan. ${detail}`
      );
    default:
      return new GlmError('http', `Server error (HTTP ${status}). ${detail}`);
  }
}

/**
 * Stream a chat completion from an OpenAI-compatible endpoint
 * (`${baseUrl}/chat/completions`) using fetch + ReadableStream.
 * SSE lines `data: {...}` are parsed and each delta is forwarded to onDelta.
 */
export async function streamChatCompletion(opts: StreamChatOptions): Promise<void> {
  const url = `${opts.baseUrl}/chat/completions`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        stream: true,
      }),
      signal: opts.signal,
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw new GlmError('aborted', 'Permintaan dihentikan.');
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new GlmError(
      'network',
      `Tidak bisa terhubung ke ${url} — periksa koneksi jaringan atau zcode.baseUrl. (${reason})`
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw mapHttpError(response.status, body);
  }
  if (!response.body) {
    throw new GlmError('http', 'Server tidak mengirimkan body respons.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handleLine = (rawLine: string): boolean => {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) {
      return false; // ignore comments / keep-alive lines
    }
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') {
      return true;
    }
    try {
      const json = JSON.parse(payload) as {
        choices?: { delta?: { content?: unknown } }[];
      };
      const delta = json.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) {
        opts.onDelta(delta);
      }
    } catch {
      // Partial JSON chunk or non-JSON event — safe to skip.
    }
    return false;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (handleLine(line)) {
          return; // [DONE]
        }
      }
    }
    // Flush any trailing line without newline.
    if (buffer.length > 0) {
      handleLine(buffer);
    }
  } catch (err) {
    if (isAbortError(err)) {
      throw new GlmError('aborted', 'Permintaan dihentikan.');
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new GlmError('network', `Stream terputus saat membaca respons. (${reason})`);
  }
}
