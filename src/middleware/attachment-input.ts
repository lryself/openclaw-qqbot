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
  return result;
}

function normalizeUrl(url: string | undefined): string {
  if (!url) return '';
  return url.startsWith('//') ? `https:${url}` : url;
}
