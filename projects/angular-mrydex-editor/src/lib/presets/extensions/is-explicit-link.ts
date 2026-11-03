const WITH_PROTOCOL = /^[a-z][a-z0-9+.-]*:\/\//i;
// Domain labels exclude the dot, so the pattern cannot backtrack polynomially on long input.
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/**
 * Tiptap autolink (`shouldAutoLink`): only turns into a link what is clearly an address.
 * Without it, linkify takes any "word.tld" in the text as a domain ("No.de" — .de is Germany —, "art.in",
 * "fs.to"…). Accepted: with a protocol (`https://…`), starting with `www.`, or an email.
 */
export function isExplicitLink(text: string): boolean {
  return WITH_PROTOCOL.test(text) || /^www\./i.test(text) || EMAIL.test(text);
}
