import { createHash } from 'node:crypto';

type Context = { sessionKey?: string; runId?: string; toolCallId?: string };
type Call = { toolName: string; params: Record<string, unknown>; toolCallId?: string; error?: string; result?: unknown };
type Entry = { callId?: string; expires: number };

// TTS tool output is auto-delivered. A second synthesis via message.voiceText
// is another send, even when both calls belong to the same inbound message.
export function createVoiceDeliveryGuard() {
  const turns = new Map<string, Map<string, Entry>>();
  function identity(event: Call, ctx: Context) {
    if (!ctx.sessionKey?.includes(':qqbot:') || !ctx.runId) return;
    const p = event.params;
    const text = event.toolName === 'tts' ? p.text
      : event.toolName === 'message' && p.action === 'send' && p.asVoice === true ? p.voiceText : undefined;
    if (typeof text !== 'string' || !text.trim()) return;
    // Explicit cross-conversation sends must remain independent.
    if (event.toolName === 'message' && typeof p.target === 'string' &&
        !ctx.sessionKey.toLowerCase().endsWith(p.target.replace(/^qqbot:/, '').toLowerCase())) return;
    const digest = createHash('sha256').update(text.trim().replace(/\s+/g, ' ')).digest('hex');
    return { turn: `${ctx.sessionKey}\0${ctx.runId}`, digest };
  }
  return {
    before(event: Call, ctx: Context) {
      const id = identity(event, ctx);
      if (!id) return;
      const now = Date.now();
      for (const [key, entries] of turns) {
        for (const [digest, entry] of entries) if (entry.expires <= now) entries.delete(digest);
        if (!entries.size) turns.delete(key);
      }
      const entries = turns.get(id.turn) ?? new Map<string, Entry>();
      if (entries.has(id.digest)) return {
        block: true,
        blockReason: 'This spoken text was already submitted for delivery in this QQ turn. Do not synthesize or send it again. Finish with NO_REPLY.',
      };
      if (turns.size >= 256 && !turns.has(id.turn)) turns.delete(turns.keys().next().value!);
      entries.set(id.digest, { callId: ctx.toolCallId ?? event.toolCallId, expires: now + 30 * 60_000 });
      turns.set(id.turn, entries);
    },
    after(event: Call, ctx: Context) {
      const id = identity(event, ctx);
      if (!id) return;
      const result = event.result as { isError?: boolean } | undefined;
      const entries = turns.get(id.turn);
      const entry = entries?.get(id.digest);
      // Only the originating failed call releases its reservation. A blocked
      // duplicate must never clear the successful first call's receipt.
      if ((event.error || result?.isError) && entry?.callId === (ctx.toolCallId ?? event.toolCallId)) {
        entries?.delete(id.digest);
      }
    },
    end(_event: unknown, ctx: Context) {
      if (ctx.sessionKey && ctx.runId) turns.delete(`${ctx.sessionKey}\0${ctx.runId}`);
    },
  };
}
