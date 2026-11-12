/**
 * Was somebody addressed by name?
 *
 * Whole words only. A substring test looks fine until an alias like "ai"
 * matches "again" or "wait" and an assistant starts answering turns nobody
 * addressed to it — or a "@cat" tag fires on "@catalogue". The same matcher
 * decides it on the server (does the agent answer?) and in the interface
 * (is the agent about to answer?), so the two cannot disagree.
 */

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A matcher for a fixed set of aliases, compiled once.
 *
 * A word character on either side of the alias means it is part of a longer
 * word and is not a mention; anything else — a space, punctuation, the start
 * or the end of the text — is a boundary. Case is ignored. Empty aliases are
 * dropped, so a blank handle can never match everything.
 */
export function mentionMatcher(aliases: readonly string[]): (text: string) => boolean {
  const patterns = aliases
    .map((alias) => alias.trim())
    .filter(Boolean)
    .map(
      (alias) => new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(alias)}(?![\\p{L}\\p{N}_])`, 'iu'),
    );
  return (text) => patterns.some((re) => re.test(text));
}

/** Does `text` mention any of `aliases` as a whole word? */
export function mentionsAny(text: string, aliases: readonly string[]): boolean {
  return mentionMatcher(aliases)(text);
}
