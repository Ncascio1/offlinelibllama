// Talking to the AI engine (llama-server's OpenAI-style API on 127.0.0.1).
'use strict';

class LlmClient {
  constructor({ baseUrl, apiKey, fetchImpl = fetch }) {
    this.baseUrl = baseUrl; this.apiKey = apiKey; this.fetch = fetchImpl;
  }

  headers() { return { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` }; }

  // Exact token count for a piece of text (llama-server's /tokenize).
  async countTokens(text, signal) {
    const res = await this.fetch(`${this.baseUrl}/tokenize`, { method: 'POST', headers: this.headers(), body: JSON.stringify({ content: text }), signal });
    if (!res.ok) throw new Error(`tokenize HTTP ${res.status}`);
    return (await res.json()).tokens.length;
  }

  // One short answer, not streamed (used for the search keywords).
  async complete(messages, { maxTokens = 48, temperature = 0, signal } = {}) {
    const res = await this.fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST', headers: this.headers(), signal,
      body: JSON.stringify({ messages, max_tokens: maxTokens, temperature, stream: false, cache_prompt: true }),
    });
    if (!res.ok) throw new Error(`chat HTTP ${res.status}`);
    const d = await res.json();
    return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
  }

  /**
   * Stream an answer. Calls onToken(text) for each new piece.
   * Stops early (without error) when `signal` is aborted: that is the Stop button.
   * @returns {Promise<{ text: string, finishReason: string|null, stopped: boolean, usage: object|null }>}
   */
  async stream(messages, { maxTokens = 512, temperature = 0.1, signal, onToken }) {
    let text = '';
    let finishReason = null;
    let usage = null;
    try {
      const res = await this.fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST', headers: this.headers(), signal,
        body: JSON.stringify({ messages, max_tokens: maxTokens, temperature, stream: true, cache_prompt: true,
          stream_options: { include_usage: true } }),
      });
      if (!res.ok) throw new Error(`chat HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const decoder = new TextDecoder();
      let buf = '';
      for await (const chunk of res.body) {
        buf += decoder.decode(chunk, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') return { text, finishReason, stopped: false, usage };
          let d;
          try { d = JSON.parse(data); } catch { continue; }
          if (d.usage) usage = d.usage;
          const c = d.choices && d.choices[0];
          if (!c) continue;
          if (c.finish_reason) finishReason = c.finish_reason;
          const piece = c.delta && c.delta.content;
          if (piece) { text += piece; if (onToken) onToken(piece); }
        }
      }
      return { text, finishReason, stopped: false, usage };
    } catch (e) {
      if (signal && signal.aborted) return { text, finishReason: 'stopped', stopped: true, usage };
      throw e;
    }
  }
}

module.exports = { LlmClient };
