'use client';

import { playTileSnap } from '@/lib/audio';

/** A fresh display order for the tray. Only the tray is reordered -- the
 * indexes it holds still point at the same scramble characters, so nothing
 * the player has already placed moves. */
export function shuffledOrder(length: number): number[] {
  const order = Array.from({ length }, (_, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Tiles have to shrink before the gap does, but past about nine of them
 * the gap is the cheapest width to give back. Counted in characters, not
 * letters: "1 Kings" is six tiles and one of them is a numeral. */
function gapFor(count: number): number {
  if (count > 13) return 3;
  if (count > 11) return 4;
  if (count > 8) return 5;
  return 7;
}

/** The letter board every mode shares: the answer slots on top, the loose
 * letters below. Lives in its own module so the Daily Word can use the
 * same board as a match without importing the app shell back into itself.
 */
export function TileBoard({ scramble, placed, setPlaced, locked, order, shakeKey, feedback = 'playing' }: {
  scramble: string;
  placed: number[];
  setPlaced: (placed: number[]) => void;
  locked?: boolean;
  order?: number[];
  shakeKey?: number;
  feedback?: 'playing' | 'correct' | 'wrong';
}) {
  // Numbered-book prefixes (e.g. "1 John") are never shown as a tile while
  // solving -- the puzzle is just the base word. The full name still shows
  // on the resolution/results screen from `entry.display`.
  const sequence = order && order.length === scramble.length ? order : scramble.split('').map((_, index) => index);
  const available = sequence.map((index) => ({ letter: scramble[index], index })).filter((item) => !placed.includes(item.index));
  // The character count drives the tile size in CSS, so an eleven-tile
  // answer keeps its shape on one line instead of wrapping 7 + 4 and
  // throwing away the silhouette the whole puzzle rests on.
  const style = { '--tiles': scramble.length, '--tile-gap': `${gapFor(scramble.length)}px` } as React.CSSProperties;
  // Re-keying the row on each new miss restarts the shake; the tiles stay
  // where the player put them, so a near-miss is not thrown away.
  return <div className={`board stone-letter-board board-${feedback}`} style={style}>
    <div className="altar-crown" aria-hidden="true"><span>✦</span><i /><span>✦</span></div>
    <div className={`answer-area${shakeKey ? ' wrong' : ''}`} key={shakeKey ?? 0} aria-label="Your answer">
    {scramble.split('').map((_, slot) => {
      const sourceIndex = placed[slot];
      return sourceIndex === undefined ? <span className="answer-slot" key={slot} /> : <button type="button" disabled={locked} className="letter-tile placed" style={{ '--slot-order': slot } as React.CSSProperties} key={slot} onClick={() => { playTileSnap('remove'); setPlaced(placed.filter((__, index) => index !== slot)); }}>{scramble[sourceIndex]}</button>;
    })}
  </div>
    <div className="letter-basin" aria-hidden="true"><span /></div>
    <div className="scramble-area" aria-label="Available letters">{available.map((item, position) => {
      const midpoint = (available.length - 1) / 2;
      const distance = midpoint === 0 ? 0 : Math.abs(position - midpoint) / midpoint;
      const arc = Math.round(distance * 10);
      const tilt = Math.round((position - midpoint) * 1.7);
      return <button type="button" disabled={locked} className="letter-tile loose" style={{ '--arc': arc, '--tilt': `${tilt}deg`, '--tile-order': position } as React.CSSProperties} key={item.index} onClick={() => { playTileSnap('place'); setPlaced([...placed, item.index]); }}>{item.letter}</button>;
    })}</div>
    <div className="basin-compass" aria-hidden="true">✦</div>
  </div>;
}
