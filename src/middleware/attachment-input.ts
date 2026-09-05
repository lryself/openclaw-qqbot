import type { QuotedAttachment } from '@tencent-connect/qqbot-nodejs';
import type { MessageAttachment } from '../types.js';

/**
 * Quote-ref resolves attachments separately from the current QQ message.
 * Normalize both sources before downloading so quoted media reaches OpenClaw's
 * native media input instead of remaining an inert URL in the quote text.
 */
export function collectInboundAttachments(
  current: readonly MessageAttachment[] | undefined,
  quoted: readonly QuotedAttachment[] | undefined,
  serializedQuote?: string,
): MessageAttachment[] {
  const seen = new Set<string>();
  const add = (attachment: MessageAttachment, result: MessageAttachment[]) => {
    const url = normalizeUrl(attachment.url);
    if (!url) return;
    const key = `${attachment.content_type?.toLowerCase() ?? ''}\u0000${url}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ ...attachment, url });
    }
  };
  const result: MessageAttachment[] = [];
  for (const attachment of current ?? []) add(attachment, result);
  for (const attachment of quoted ?? []) {
    add({
      content_type: attachment.contentType,
      url: attachment.url,
      filename: attachment.filename,
      asr_refer_text: attachment.asrText,
    }, result);
  }
  for (const attachment of extractSerializedQuoteAttachments(serializedQuote)) add(attachment, result);
  return result;
}

/**
 * The persisted quote index retains QQ's rendered quote text but not its
 * attachment array. Accept only the SDK's own QQ multimedia marker so a
 * quoted image remains usable after that structured metadata has been lost.
 */
function extractSerializedQuoteAttachments(text: string | undefined): MessageAttachment[] {
  if (!text) return [];
  const attachments: MessageAttachment[] = [];
  const marker = /(?:^|\n)\[附件\d+\]\s*类型:(图片|视频|语音|文件)\s+文件名:([^\s\n]+)[^\n]*?\s+URL:(https:\/\/multimedia(?:\.nt)?\.qq\.com\.cn\/download\?[^\s\n]+)/g;
  for (const match of text.matchAll(marker)) {
    const [, kind, filename, url] = match;
    attachments.push({
      content_type: mediaTypeFor(kind!, filename!),
      filename,
      url,
    });
  }
  return attachments;
}

function mediaTypeFor(kind: string, filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const extensionTypes: Record<string, string> = {
    gif: 'image/gif', jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    m4a: 'audio/mp4', mp3: 'audio/mpeg', silk: 'audio/silk', wav: 'audio/wav',
    mov: 'video/quicktime', mp4: 'video/mp4', webm: 'video/webm',
  };
  return extensionTypes[ext ?? ''] ?? ({ 图片: 'image/jpeg', 视频: 'video/mp4', 语音: 'audio/silk' }[kind] ?? 'application/octet-stream');
}

function normalizeUrl(url: string | undefined): string {
  if (!url) return '';
  return url.startsWith('//') ? `https:${url}` : url;
}
