import type { Reply } from './types.ts';
import { LEGAL_URLS } from '../legal/urls.ts';

export function handleLegal(): Reply {
  return {
    content: `Terms of Service: ${LEGAL_URLS.tos}\nPrivacy Policy: ${LEGAL_URLS.privacy}`,
    ephemeral: true,
  };
}
