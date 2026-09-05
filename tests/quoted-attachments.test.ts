import assert from 'node:assert';
import { collectInboundAttachments } from '../src/middleware/attachment-input.js';
import { buildCtxPayload } from '../src/dispatch/ctx-builder.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.error(`  ✗ ${name}\n    ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }
}

test('normalizes quoted image and video attachments while preserving current attachment order', () => {
  const attachments = collectInboundAttachments(
    [{ content_type: 'image/jpeg', url: '//cdn.qq.com/current.jpg', filename: 'current.jpg' }],
    [
      { contentType: 'image/jpeg', url: '//cdn.qq.com/current.jpg', filename: 'duplicate.jpg' },
      { contentType: 'image/png', url: '//cdn.qq.com/quoted.png', filename: 'quoted.png' },
      { contentType: 'video/mp4', url: 'https://cdn.qq.com/quoted.mp4', filename: 'quoted.mp4' },
    ],
  );

  assert.deepStrictEqual(
    attachments.map((attachment) => [attachment.content_type, attachment.url, attachment.filename]),
    [
      ['image/jpeg', 'https://cdn.qq.com/current.jpg', 'current.jpg'],
      ['image/png', 'https://cdn.qq.com/quoted.png', 'quoted.png'],
      ['video/mp4', 'https://cdn.qq.com/quoted.mp4', 'quoted.mp4'],
    ],
  );
});

test('passes downloaded quoted image and video to OpenClaw as native media', () => {
  let inbound: Record<string, unknown> | undefined;
  buildCtxPayload({
    assembled: { rawBody: '请看引用内容', webBody: '请看引用内容', agentBody: '请看引用内容' },
    envelope: {
      chatScope: 'group',
      groupId: 'group-1',
      senderId: 'sender-1',
      senderName: 'Sender',
      targetId: 'group-1',
      messageId: 'message-1',
    },
    route: { sessionKey: 'qqbot:group:group-1', accountId: 'default' },
    msg: { timestamp: '2026-09-05T00:00:00.000Z' },
    ctx: {
      state: {
        processedAttachments: {
          localMediaPaths: ['/tmp/quoted.png', '/tmp/quoted.mp4'],
          localMediaTypes: ['image/png', 'video/mp4'],
          remoteMediaUrls: [],
          remoteMediaTypes: [],
        },
      },
    },
    adapters: { buildInboundContext: (payload: Record<string, unknown>) => {
      inbound = payload;
      return payload;
    } },
  } as never);

  assert.deepStrictEqual(inbound?.media, [
    { contentType: 'image/png', localPath: '/tmp/quoted.png' },
    { contentType: 'video/mp4', localPath: '/tmp/quoted.mp4' },
  ]);
});

console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed) process.exit(1);
