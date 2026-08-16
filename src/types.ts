/**
 * The data model.
 *
 * One idea holds the whole library up: **a thread is a set of participants and
 * an ordered log of messages, and permission is participation.** Not role, not
 * a `patient_id` column, not "is this person an admin". Every authorization
 * question in this package reduces to "is this actor a participant, and was
 * this message inside their window?"
 *
 * That constraint is what lets the same core serve a two-party doctor↔patient
 * thread, a group with several clinicians, and a thread where one participant
 * is an AI — without a schema change per shape.
 */

/**
 * What kind of thing is speaking.
 *
 * This exists so an AI author need not be faked as a user row — the usual
 * workaround, which quietly gives the model a login. It is descriptive only:
 * `kind` is never consulted when deciding who may read or write.
 */
export type ActorKind = 'human' | 'ai' | 'system';

/**
 * Where a participant's view of the thread begins.
 *
 * `'thread-start'` grants the whole history. The default is the moment they
 * joined, which is the safe direction: adding a second clinician to a patient
 * thread should not silently hand them everything said before they were
 * involved. Disclosing history is a decision someone has to make on purpose.
 */
export type VisibleFrom = Date | 'thread-start';

export interface Participant {
  /** Stable id of the actor. Your user id for humans; whatever you like for an AI. */
  readonly actorId: string;
  readonly kind: ActorKind;
  /**
   * A domain label — 'patient', 'clinician', 'observer', 'assistant'.
   *
   * Here so your UI can group and title people. Deliberately NOT used by any
   * function in this package to grant access. The moment a role grants read
   * access, "any admin can read any thread" becomes true — and that is the bug
   * this model exists to make unrepresentable.
   */
  readonly role?: string;
  readonly joinedAt: Date;
  /** Set when they leave: they keep what they saw, and stop receiving what comes next. */
  readonly leftAt?: Date | null;
  /** Defaults to `joinedAt`. */
  readonly visibleFrom?: VisibleFrom;
  /** Defaults to true. An observer, or a paused AI, can be present but silent. */
  readonly canWrite?: boolean;
  /**
   * High-water mark for reads — one timestamp per participant.
   *
   * Deliberately not a read flag on the message row. A flag on the message is a
   * single-reader assumption: the first person to open the thread marks it read
   * for everybody. That is invisible with two participants and wrong with three.
   */
  readonly lastReadAt?: Date | null;
}

/** Where an AI message came from, so a clinical record can say so honestly. */
export interface AiProvenance {
  readonly model: string;
  readonly promptVersion?: string;
}

export interface Message {
  readonly id: string;
  readonly threadId: string;
  /** The `actorId` of a participant — not necessarily a row in your users table. */
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: Date;
  /**
   * Client-generated id for a message sent but not yet confirmed. Lets an
   * optimistic bubble reconcile with the stored row instead of appearing twice.
   */
  readonly clientId?: string;
  /** Present iff a model wrote this. Absent means a human or your system did. */
  readonly generatedBy?: AiProvenance;
}

export interface Thread {
  readonly id: string;
  readonly participants: readonly Participant[];
  readonly subject?: string;
  readonly createdAt: Date;
}

/**
 * The model seam — the same shape as the one in `ai-forms`, on purpose.
 *
 * This package never imports an SDK, never reads an API key, and never decides
 * which model you use. You pass a function that turns a prompt into text; how
 * it gets there is your business.
 */
export type CompleteFn = (input: {
  system: string;
  prompt: string;
  maxTokens: number;
  temperature: number;
}) => Promise<string>;
