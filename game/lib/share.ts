/** The result card. It is built from counts alone -- the answer word is
 * never passed in, so it cannot leak into a group chat where somebody has
 * not played yet. That is enforced by the signature, not by care. */

export type ShareInput = {
  /** The Daily Word number, e.g. 142. */
  number: number;
  solved: boolean;
  /** Attempts made, including the winning one. */
  guesses: number;
  hintsUsed: number;
  /** Day streak after this result. */
  streak: number;
  /** A level name such as "Eternity". Omitted for the plain daily. */
  level?: string;
};

const SOLVED = '\u{1F7E9}';
const HINT = '\u{1F7E8}';
const MISS = '⬜';
const FLAME = '\u{1F525}';

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function buildShareText(input: ShareInput): string {
  const { number, solved, hintsUsed, streak, level } = input;
  const guesses = Math.max(1, Math.round(input.guesses));
  const hints = Math.max(0, Math.round(hintsUsed));
  // A solve spends its last guess on the answer; a loss spends them all.
  const wrong = solved ? guesses - 1 : guesses;

  const marks = MISS.repeat(wrong) + (solved ? SOLVED : 'X') + HINT.repeat(hints);
  const tries = guesses === 1 ? 'first try' : `${guesses} tries`;
  const hintNote = hints === 0 ? 'no hints' : plural(hints, 'hint');
  const outcome = solved ? `${tries}, ${hintNote}` : `not today, ${hintNote}`;
  const flame = streak > 0 ? `${FLAME} ${streak} day streak` : `${FLAME} a new streak starts tomorrow`;

  return [
    `WordIn #${number}${level ? ` · ${level}` : ''}`,
    `${marks} ${outcome}`,
    flame,
  ].join('\n');
}

/** Hand the card to whatever the browser has. `navigator.share` is the
 * good path on a phone; `navigator.clipboard` is the fallback; both are
 * missing often enough (older Safari, a page served over plain http, an
 * iframe without permission) that neither may be assumed, and `share`
 * also rejects when the sheet is dismissed. Every branch is wrapped, and
 * the caller gets a word it can put in a toast. */
export async function shareResult(text: string): Promise<'copied' | 'shared' | 'failed'> {
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  if (!nav) return 'failed';

  if (typeof nav.share === 'function') {
    try {
      await nav.share({ text });
      return 'shared';
    } catch {
      /* dismissed or unsupported payload -- try the clipboard instead */
    }
  }

  try {
    if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      await nav.clipboard.writeText(text);
      return 'copied';
    }
  } catch {
    /* permission denied or no secure context */
  }

  return 'failed';
}
