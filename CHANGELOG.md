# Changelog

## 0.1.2 — Files on a message, read receipts with an assistant in the room

Additive: nothing that compiled against 0.1.1 changes.

- **Attachments.** `Message.attachments` (an `Attachment`: kind, name, type, bytes, and pixels or duration where it has them) and the policy that decides what may be attached: `checkAttachment` answers with the kind or with the reason and its number (`type`, `size`, `count`, `quota`, `empty`). The policy is an allowlist; a type it does not name is refused, and `image/svg+xml` and `text/html` are left out of the default because both can carry script. `attachmentExpiresAt`, `isAttachmentExpired` and `isAbandonedUpload` are the lifetime rules, `storedBytes` is what a quota counts. The package still stores and signs nothing.
- **`readState(thread, message)`**: `none`, `some` or `all`, over the humans the message was for. Found in OrangeCat, 2026-11-12: once its assistant had answered in a conversation it stayed as a participant, never "read" anything, and every later message was stuck at delivered, because the receipt waited for a reader that does not read.
- **`mentionsAny` / `mentionMatcher`**: the whole-word matcher `whenMentioned` already used, exported so an interface and a server share one definition. It now treats letters outside ASCII as letters (`aiü` no longer matches the alias `ai`).
- **Your own message type comes back.** `mergeMessages`, `visibleMessages` and `unreadMessages` are generic over the message, so rows that carry more than this package knows (a sender's name, an edited-at) no longer have to be looked up again by id after a merge.

## Renamed — `threadkit` is now `@bitbaum/threadkit`

Same code, same version, same repository; the package now lives under the
`@bitbaum` npm organization like the rest of the fleet's packages. Install
`@bitbaum/threadkit` and import from it (`threadkit` stays installable and is deprecated
once no adopter uses it). No API changed.

This retrospective record was added on 2026-10-27 from the immutable sources
linked below. Git commit dates are source dates, not inferred npm publication
dates. A GitHub release does not itself establish npm publication.
Application adoption and deployment evidence are tracked separately.

## 0.1.1

- [Tagged source `v0.1.1`](https://github.com/bitbaum/threadkit/tree/047dc691e20d14b014032e7ba5d0726415d99758)
- [Source commit](https://github.com/bitbaum/threadkit/commit/047dc691e20d14b014032e7ba5d0726415d99758), dated 2026-08-20.

No authored release notes were found for this tag when this record was made.
The links identify the verified source; missing feature history is not invented.
