# threadkit

Headless multi-participant message threads, with AI participants that obey the same rules as everyone else.

No UI, no database, no SDK. Pure functions over data you already loaded, so the rules that decide who can read what are things you can unit-test instead of things buried in a `WHERE` clause.

```bash
npm install threadkit
```

## The idea

Most messaging code encodes the number of participants into the schema. Two columns named `participant_1` and `participant_2`. A `patient_id` on the thread. A `read_at` flag on the message row. Each of these is correct right up until the day a third party joins, and then every one of them needs a migration.

threadkit takes one position and derives everything from it:

> **Permission is participation.** Not role, not ownership, not a column on the thread.

A thread is a set of participants and an ordered log of messages. Whether it is a two-party DM, a group with four clinicians, or a conversation where one participant is a language model is a property of the participant list — not of the schema.

## Why this matters more than it sounds

Role-derived access reads fine and is wrong in a way tests usually miss:

```ts
if (session.user.role !== 'admin' && thread.patientId !== session.user.id) forbid()
```

That is correct while the clinic has exactly one doctor. On the day it has two, every doctor can read every patient's thread — and nothing failed, so nobody finds out. The same shape hides in any app with one tenant, one workspace, or one org in production.

Participation-based access cannot express that bug, because there is no role to check:

```ts
import { canRead, visibleMessages } from 'threadkit'

if (!canRead(thread, actorId)) return forbidden()
const messages = visibleMessages(thread, actorId, allMessages)
```

`visibleMessages` returns `[]` for a non-participant rather than throwing, so a caller that forgets to gate still leaks nothing. Failing closed is deliberate.

## What you get

**Joining does not grant history.** A clinician added to a patient thread today sees what is said from today. Handing over the backlog is a decision someone makes on purpose:

```ts
{ actorId: 'dr-b', kind: 'human', joinedAt: now, visibleFrom: 'thread-start' }
```

**Leaving keeps the past and stops the future.** A participant with `leftAt` retains what they already saw and receives nothing after it.

**Unread is per person.** A read high-water mark per participant, not a flag on the message. A flag on the message row means the first person to open a thread clears the badge for everybody — invisible with two participants, wrong with three.

```ts
unreadCount(thread, 'dr-b', messages)      // just theirs
unreadThreadCount(entries, 'dr-b')         // the nav badge
```

**Optimistic sends reconcile instead of duplicating.** `mergeMessages` matches on `id`, then on `clientId`, so the confirmed row replaces its placeholder rather than arriving beside it — the most common visible bug in a chat UI.

## AI as a participant

An AI is a participant, not an exception. It reads through the same visibility window as every human, so a model added to an existing thread sees what it was granted and nothing earlier.

```ts
import { runAiTurn } from 'threadkit'

const result = await runAiTurn(thread, messages, {
  actorId: 'assistant-1',
  systemPrompt: 'You support the patient between consultations.',
  model: 'claude-opus-5',
  complete: async ({ system, prompt, maxTokens, temperature }) => {
    // your provider, your key, your model choice
  },
})

if (result.status === 'responded') {
  await store.append({ authorId: 'assistant-1', body: result.body, generatedBy: result.generatedBy })
} else {
  log.info('assistant stayed quiet', result.reason)
}
```

The package never imports an SDK and never reads an API key. You pass a `complete` function; how the text is produced is your business.

Defaults that keep it usable:

- **It never answers itself.** The loop guard runs before any policy, so a custom policy cannot talk it into an unbounded self-conversation.
- **Two participants → it answers every turn.** It *is* the conversation.
- **Three or more → it waits to be addressed.** A clinician and a patient talking to each other is not an invitation. Mentions match on whole words, so "I had to w**ai**t ag**ai**n" does not summon it.
- **Silence is a normal outcome.** A skipped turn returns a reason instead of throwing, and never spends a model call.
- **Speakers are labelled by role, not by name.** The transcript says `patient:`, not `Dr. Schabus:` — real names never have to reach the model, and `Participant` has no name field to leak.

Every reply carries `generatedBy`, so a record can say honestly which model wrote what.

## Bring your own storage

There is no database adapter and no ORM. Load a thread and its messages however you already do, call the functions, write the result back. That is the whole integration surface — which is also why it works the same on Drizzle, Prisma, Supabase, or a JSON file.

## API

| | |
|---|---|
| `canRead(thread, actorId)` | is this actor a participant at all |
| `canWrite(thread, actorId, now?)` | may they post right now |
| `visibleMessages(thread, actorId, messages)` | what they are allowed to see, in order |
| `canSeeMessage(participant, message)` | the single-message form |
| `visibilityWindow(participant)` | the `[from, to)` interval they may see |
| `readersOf(thread, message)` | who has seen it, excluding the author |
| `unreadMessages` / `unreadCount` | per participant |
| `unreadThreadCount(entries, actorId)` | threads with anything unread |
| `mergeMessages(existing, incoming)` | dedupe, reconcile optimistic, order |
| `compareMessages` / `isPending` | ordering and pending-state helpers |
| `runAiTurn(thread, messages, config)` | decide whether the AI speaks, and what it says |
| `afterEveryMessage` / `whenMentioned` / `defaultRespondPolicy` | response policies |

## Licence

MIT
