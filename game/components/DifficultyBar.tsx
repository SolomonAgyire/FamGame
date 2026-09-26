'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LEVEL_NAMES } from '@/lib/types';
import type { Level, RoomDifficulty } from '@/lib/types';

const LEVELS: Level[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** "Mixed", or the level's own name -- exported so the lobby's read-only
 * summary (shown to everyone but the host) can describe the same value
 * this control picks, without duplicating the ternary. */
export function roomDifficultyLabel(value: RoomDifficulty): string {
  return value === 'mixed' ? 'Mixed' : LEVEL_NAMES[value - 1];
}
const labelFor = roomDifficultyLabel;

/** The online room lobby's difficulty control -- called "Difficulty", not
 * "Level", because in a room it is simply picked rather than earned. Modeled
 * on `LevelBar`'s compact trigger-and-sheet so the lobby does not scroll,
 * but deliberately ungated: a room stays playable at any difficulty
 * regardless of the host's own progress, so nothing here reads
 * `getProgressSnapshot()` the way `LevelPath` does. `'mixed'` -- a rising
 * spread across all nine levels, meant for a table of mixed ability -- is
 * listed first and is what every room opens on. */
export function DifficultyBar({ selected, onSelect }: { selected: RoomDifficulty; onSelect: (value: RoomDifficulty) => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    // The sheet covers the page; letting the page behind it scroll is how a
    // phone user loses their place.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, close]);

  const pick = (value: RoomDifficulty) => { onSelect(value); close(); };

  return <>
    <button
      ref={triggerRef}
      type="button"
      className="level-bar"
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={() => setOpen(true)}
    >
      <span className="level-badge" aria-hidden="true">{selected === 'mixed' ? '~' : selected}</span>
      <span className="level-bar-text">
        <strong>{labelFor(selected)}</strong>
        <small>{selected === 'mixed' ? 'Starts easy, gets harder' : 'Every puzzle at this level'}</small>
      </span>
      <span className="level-bar-chevron" aria-hidden="true">⌄</span>
      <span className="sr-only">Change difficulty. Currently {labelFor(selected)}.</span>
    </button>

    {open && <div className="sheet-backdrop" onClick={close}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Choose the room's difficulty"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <h2>Difficulty</h2>
          <button type="button" className="sheet-close" onClick={close} aria-label="Close">×</button>
        </div>
        <div className="sheet-body">
          <ol className="level-path" aria-label="Difficulty options">
            <li className={`level-node ${selected === 'mixed' ? 'selected' : ''}`}>
              <button type="button" aria-current={selected === 'mixed' ? 'true' : undefined} onClick={() => pick('mixed')}>
                <span className="level-badge" aria-hidden="true">~</span>
                <span className="level-text"><strong>Mixed</strong><small>Starts easy, gets harder -- best for a mixed-ability group</small></span>
              </button>
            </li>
            {LEVELS.map((level) => <li key={level} className={`level-node ${selected === level ? 'selected' : ''}`}>
              <button type="button" aria-current={selected === level ? 'true' : undefined} onClick={() => pick(level)}>
                <span className="level-badge" aria-hidden="true">{level}</span>
                <span className="level-text"><strong>{LEVEL_NAMES[level - 1]}</strong><small>Every puzzle at this level</small></span>
              </button>
            </li>)}
          </ol>
        </div>
      </div>
    </div>}
  </>;
}
