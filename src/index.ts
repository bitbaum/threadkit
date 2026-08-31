export type {
  ActorKind,
  AiProvenance,
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
  visibilityWindow,
  visibleMessages,
} from './participants.js';

export { unreadCount, unreadMessages, unreadThreadCount } from './unread.js';

export { compareMessages, isPending, mergeMessages } from './merge.js';

export { afterEveryMessage, defaultRespondPolicy, runAiTurn, whenMentioned } from './ai.js';
export type { AiParticipantConfig, AiTurnContext, AiTurnResult, RespondPolicy } from './ai.js';
