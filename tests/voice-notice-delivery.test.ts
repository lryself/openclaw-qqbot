import assert from 'node:assert/strict';
import { voiceDeliveryGuard } from '../src/features/voice-delivery-guard.js';
import { deliverReply } from '../src/outbound/deliver-pipeline.js';

async function main() {
  const ctx = { sessionKey: 'agent:main:qqbot:group:proof', runId: 'proof-turn', toolCallId: 'first' };
  voiceDeliveryGuard.before({ toolName: 'tts', params: { text: '测试一次' } }, ctx);
  voiceDeliveryGuard.after({ toolName: 'tts', params: { text: '测试一次' }, result: {} }, ctx);
  voiceDeliveryGuard.before({ toolName: 'message', params: {
    action: 'send', asVoice: true, voiceText: '测试一次', target: 'qqbot:group:proof',
  } }, { ...ctx, toolCallId: 'duplicate' });
  const sent: string[] = [];
  const delivery = {
    ...ctx, qualifiedTarget: 'qqbot:group:proof', accountId: 'default', replyToId: 'proof-turn',
    sendText: async (_to: string, text: string) => { sent.push(text); return { messageId: 'sent' }; },
    sendMedia: async () => { throw new Error('unexpected media send'); },
  };
  await deliverReply({ text: '⚠️ Message blocked', isError: true }, { kind: 'final' }, delivery);
  assert.deepEqual(sent, []);
  await deliverReply({ text: '⚠️ TTS failed', isError: true }, { kind: 'final' }, delivery);
  assert.deepEqual(sent, ['⚠️ TTS failed']);
  console.log('PASS: real deliverReply suppresses only receipted duplicate notice and delivers genuine error');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
