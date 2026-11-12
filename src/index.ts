export type {
  ActorKind,
  AiProvenance,
  Attachment,
  AttachmentKind,
  CompleteFn,
  Message,
  Participant,
  Thread,
  VisibleFrom,
} from './types.js';

export {
  canRead,
  canSeeMessage,
  canWrite,
  findParticipant,
  readersOf,
  readState,
  visibilityWindow,
  visibleMessages,
} from './participants.js';

export { unreadCount, unreadMessages, unreadThreadCount } from './unread.js';

export { compareMessages, isPending, mergeMessages } from './merge.js';

export { afterEveryMessage, defaultRespondPolicy, runAiTurn, whenMentioned } from './ai.js';
export type { AiParticipantConfig, AiTurnContext, AiTurnResult, RespondPolicy } from './ai.js';

export {
  DEFAULT_ATTACHMENT_POLICY,
  attachmentExpiresAt,
  attachmentKind,
  checkAttachment,
  isAbandonedUpload,
  isAttachmentExpired,
  storedBytes,
} from './attachments.js';
export type {
  AttachmentCheck,
  AttachmentPolicy,
  AttachmentRefusal,
  AttachmentUsage,
} from './attachments.js';

export { mentionMatcher, mentionsAny } from './mentions.js';
