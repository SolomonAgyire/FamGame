'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getProgressServerSnapshot, getProgressSnapshot, subscribeProgress } from '@/lib/progress';
import { ALL_LEVELS, levelStatus, starsForLevel } from '@/lib/levels';
import { LevelPath } from '@/components/LevelPath';
import type { Level } from '@/lib/types';

/** The nine levels are a journey, not a difficulty dial, so the collapsed
 * control keeps the whole path visible as a nine-segment rail instead of
 * reducing it to a number in a dropdown. Expanded, it is the same list as
 * before -- it just no longer costs most of the home screen to show. */
export function LevelBar({ selected, onSelect, variant = 'bar', newlyUnlocked }: { selected: Level; onSelect: (level: Level) => void; variant?: 'bar' | 'ground'; newlyUnlocked?: Level | null }) {
  const record = useSyncExternalStore(subscribeProgress, getProgressSnapshot, getProgressServerSnapshot);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const status = levelStatus(record, selected);

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

  const pick = (level: Level) => { onSelect(level); close(); };

  const sheet = open && <div className="sheet-backdrop" onClick={close}>
    <div
      className="sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Choose your level"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="sheet-grip" aria-hidden="true" />
      <div className="sheet-head">
        <h2>Your journey</h2>
        <button type="button" className="sheet-close" onClick={close} aria-label="Close">×</button>
      </div>
      <div className="sheet-body">
        <LevelPath selected={selected} onSelect={pick} />
      </div>
    </div>
  </div>;

  if (variant === 'ground') return <>
    <nav className="ground-level-path" aria-label="Journey levels">
      <span className="ground-path-trail" aria-hidden="true" />
      {ALL_LEVELS.map((level, index) => {
        const each = levelStatus(record, level);
        const stars = starsForLevel(record, level);
        return <button
          key={level}
          type="button"
          className={`ground-level-node ground-level-${index} ${level === selected ? 'selected' : ''} ${each.cleared ? 'cleared' : ''} ${level === newlyUnlocked ? 'just-unlocked' : ''}`}
          disabled={!each.unlocked}
          onClick={() => onSelect(level)}
          aria-label={`${each.name}, level ${level}${level === selected ? ', selected' : ''}${each.unlocked ? '' : ', locked'}`}
        >
          <span>{each.unlocked ? level : '◆'}</span>
          {level === selected && <small>{each.name}</small>}
          <i className="ground-node-stars" aria-hidden="true">{[1, 2, 3].map((star) => <b key={star} className={star <= stars ? 'earned' : ''}>★</b>)}</i>
        </button>;
      })}
      <span className="journey-treasure" aria-hidden="true">✦</span>
      <button ref={triggerRef} type="button" className="ground-level-more" aria-label="Open all journey levels" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(true)}>☰<small>Levels</small></button>
    </nav>
    {sheet}
  </>;

  return <>
    <button
      ref={triggerRef}
      type="button"
      className="level-bar"
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={() => setOpen(true)}
    >
      <span className={`level-badge ${status.cleared ? 'is-cleared' : ''}`} aria-hidden="true">
        {status.cleared ? '✓' : selected}
      </span>
      <span className="level-bar-text">
        <strong>{status.name}</strong>
        <small>{status.cleared ? 'Cleared' : `${status.solved} of ${status.needed} words`}</small>
        <span className="level-rail" aria-hidden="true">
          {ALL_LEVELS.map((level) => {
            const each = levelStatus(record, level);
            return <i
              key={level}
              className={each.cleared ? 'done' : level === selected ? 'here' : each.unlocked ? 'open' : 'shut'}
            />;
          })}
        </span>
      </span>
      <span className="level-bar-chevron" aria-hidden="true">⌄</span>
      <span className="sr-only">Change level. Currently {status.name}, level {selected} of 9.</span>
    </button>

    {sheet}
  </>;
}
