'use client';

import { playTap } from '@/lib/audio';

/** The letter board every mode shares: the answer slots on top, the loose
 * letters below. Lives in its own module so the Daily Word can use the
 * same board as a match without importing the app shell back into itself.
 */
export function TileBoard({ scramble, placed, setPlaced, locked }: { scramble: string; placed: number[]; setPlaced: (placed: number[]) => void; locked?: boolean }) {
  // Numbered-book prefixes (e.g. "1 John") are never shown as a tile while
  // solving -- the puzzle is just the base word. The full name still shows
  // on the resolution/results screen from `entry.display`.
  const available = scramble.split('').map((letter, index) => ({ letter, index })).filter((item) => !placed.includes(item.index));
  return <div className="board"><div className="answer-area" aria-label="Your answer">
    {scramble.split('').map((_, slot) => {
      const sourceIndex = placed[slot];
      return sourceIndex === undefined ? <span className="answer-slot" key={slot} /> : <button type="button" disabled={locked} className="letter-tile placed" key={slot} onClick={() => { playTap(); setPlaced(placed.filter((__, index) => index !== slot)); }}>{scramble[sourceIndex]}</button>;
    })}
  </div><div className="scramble-area" aria-label="Available letters">{available.map((item) => <button type="button" disabled={locked} className="letter-tile" key={item.index} onClick={() => { playTap(); setPlaced([...placed, item.index]); }}>{item.letter}</button>)}</div></div>;
}
