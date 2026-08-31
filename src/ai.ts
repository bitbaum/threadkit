import type { AiProvenance, CompleteFn, Message, Participant, Thread } from './types.js';
import { canWrite, findParticipant, visibleMessages } from './participants.js';

/**
 * An AI that participates in a thread rather than owning one.
 *
 * The design rule: **the model is a participant, not an exception.** It reads
 * through `visibleMessages` like everybody else, so an assistant added to an
 * existing doctor↔patient thread sees what it was granted and nothing earlier.
 * A chatbot bolted onto a thread usually gets handed the whole transcript
 * because that is the easy call to write — which is exactly how a model ends up
 * summarising history somebody deliberately withheld.
 */

export interface AiTurnContext {
  readonly thread: Thread;
  /** Only what this AI is allowed to see, already filtered and ordered. */
  readonly visible: readonly Message[];
  readonly self: Participant;
}

export type RespondPolicy = (ctx: AiTurnContext) => boolean;

export interface AiParticipantConfig {
  readonly actorId: string;
  readonly complete: CompleteFn;
  readonly systemPrompt: string;
  /** Recorded as provenance on the message. Not used to pick a model — your `complete` did that. */
  readonly model?: string;
  readonly promptVersion?: string;
  readonly shouldRespond?: RespondPolicy;
  readonly maxTokens?: number;
  readonly temperature?: number;
  /** Consecutive AI messages tolerated before refusing to add another. Default 1. */
  readonly maxConsecutive?: number;
  /**
   * How a participant is labelled in the transcript handed to the model.
   *
   * A callback rather than a field on `Participant`, so real names never have to
   * be stored in this package's model at all. Defaults to the domain role, which
   * is usually what you want the model to reason about anyway ("clinician said",
   * not "Dr. Schabus said").
   */
  readonly displayNameFor?: (p: Participant) => string;
}

export type AiTurnResult =
  | { readonly status: 'responded'; readonly body: string; readonly generatedBy: AiProvenance }
  | { readonly status: 'skipped'; readonly reason: string };

const DEFAULT_MAX_TOKENS = 800;
const DEFAULT_TEMPERATURE = 0.4;

/** Reply to any message that is not the AI's own. Suits a two-party AI↔human thread. */
export const afterEveryMessage: RespondPolicy = ({ visible, self }) => {
  const last = visible[visible.length - 1];
  return last !== undefined && last.authorId !== self.actorId;
};

/**
 * Reply only when named. Suits a group, where an assistant that answers every
 * turn is noise and, between a doctor and a patient, an interruption.
 */
export function whenMentioned(aliases: readonly string[]): RespondPolicy {
  // Whole words only. A substring test looks fine until an alias like "ai"
  // matches "again" or "wait" and the assistant starts answering turns nobody
  // addressed to it.
  const patterns = aliases
    .filter(Boolean)
    .map((a) => new RegExp(`(^|\\W)${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`, 'i'));
  return ({ visible, self }) => {
    const last = visible[visible.length - 1];
    if (!last || last.authorId === self.actorId) return false;
    return patterns.some((re) => re.test(last.body));
  };
}

/**
 * What to do when the caller expresses no preference.
 *
 * Two participants means the AI *is* the conversation, so it answers. Three or
 * more means humans are talking to each other and the assistant waits to be
 * addressed. Defaulting the group case to "always answer" would make every
 * clinical thread unusable the moment an assistant joined.
 */
export function defaultRespondPolicy(ctx: AiTurnContext): boolean {
  const active = ctx.thread.participants.filter((p) => !p.leftAt);
  if (active.length <= 2) return afterEveryMessage(ctx);
  return whenMentioned([ctx.self.role ?? 'assistant', 'ai'])(ctx);
}

function trailingSelfMessages(visible: readonly Message[], actorId: string): number {
  let n = 0;
  for (let i = visible.length - 1; i >= 0; i--) {
    if (visible[i].authorId !== actorId) break;
    n++;
  }
  return n;
}

function renderTranscript(ctx: AiTurnContext, label: (p: Participant) => string): string {
  return ctx.visible
    .map((m) => {
      const author = findParticipant(ctx.thread, m.authorId);
      const who = author ? label(author) : 'unknown';
      return `${who}: ${m.body}`;
    })
    .join('\n');
}

/**
 * Decide whether this AI should speak, and if so, what it says.
 *
 * Returns rather than throws, and says why it declined — a turn that produces
 * nothing is a normal outcome here, not a failure, and the caller usually wants
 * to log the reason rather than treat silence as an error.
 *
 * This function does not persist anything. Storing the result, and deciding
 * whether a model's words belong in a clinical record at all, stays with you.
 */
export async function runAiTurn(
  thread: Thread,
  allMessages: readonly Message[],
  config: AiParticipantConfig,
): Promise<AiTurnResult> {
  const self = findParticipant(thread, config.actorId);
  if (!self) return { status: 'skipped', reason: 'not a participant in this thread' };
  if (!canWrite(thread, config.actorId)) {
    return { status: 'skipped', reason: 'this participant may not write' };
  }

  const visible = visibleMessages(thread, config.actorId, allMessages);
  if (visible.length === 0) {
    return { status: 'skipped', reason: 'nothing visible to respond to' };
  }

  // Loop guard runs before the policy, so no custom policy can talk the model
  // into an unbounded self-conversation.
  const maxConsecutive = config.maxConsecutive ?? 1;
  if (trailingSelfMessages(visible, config.actorId) >= maxConsecutive) {
    return { status: 'skipped', reason: 'already the most recent speaker' };
  }

  const ctx: AiTurnContext = { thread, visible, self };
  const policy = config.shouldRespond ?? defaultRespondPolicy;
  if (!policy(ctx)) return { status: 'skipped', reason: 'policy declined this turn' };

  const label = config.displayNameFor ?? ((p: Participant) => p.role ?? p.kind);
  const body = (
    await config.complete({
      system: config.systemPrompt,
      prompt: renderTranscript(ctx, label),
      maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: config.temperature ?? DEFAULT_TEMPERATURE,
    })
  ).trim();

  if (!body) return { status: 'skipped', reason: 'model returned nothing' };

  return {
    status: 'responded',
    body,
    generatedBy: { model: config.model ?? 'unknown', promptVersion: config.promptVersion },
  };
}
