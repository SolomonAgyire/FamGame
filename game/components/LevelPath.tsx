'use client';

import { useSyncExternalStore } from 'react';
import { getProgressServerSnapshot, getProgressSnapshot, subscribeProgress } from '@/lib/progress';
import { ALL_LEVELS, levelStatus, starsForLevel } from '@/lib/levels';
import type { Level } from '@/lib/types';

export function LevelPath({ selected, onSelect }: { selected: Level; onSelect: (level: Level) => void }) {
  // The server snapshot is an empty record, so the server render and the
  // first client render agree; React swaps in the stored record straight
  // after hydration, and a finished match re-renders the path in place.
  const record = useSyncExternalStore(subscribeProgress, getProgressSnapshot, getProgressServerSnapshot);

  return <ol className="level-path" aria-label="Your journey">
    {ALL_LEVELS.map((level) => {
      const status = levelStatus(record, level);
      const isSelected = selected === level;
      return <li key={level} className={`level-node ${status.unlocked ? '' : 'locked'} ${status.cleared ? 'cleared' : ''} ${isSelected ? 'selected' : ''}`}>
        <button
          type="button"
          disabled={!status.unlocked}
          aria-current={isSelected ? 'true' : undefined}
          onClick={() => onSelect(level)}
        >
          <span className="level-badge" aria-hidden="true">{status.cleared ? '✓' : status.unlocked ? level : '🔒'}</span>
          <span className="level-text">
            <strong>{status.name}</strong>
            <small>{status.unlocked
              ? status.cleared ? 'Cleared' : `${status.solved} of ${status.needed} words`
              : 'Locked'}</small>
          </span>
          {status.unlocked && <span className="level-node-stars" aria-hidden="true">
            {[1, 2, 3].map((star) => <b key={star} className={star <= starsForLevel(record, level) ? 'earned' : ''}>★</b>)}
          </span>}
          {status.unlocked && !status.cleared && <span className="level-meter" aria-hidden="true">
            <i style={{ width: `${Math.min(100, (status.solved / status.needed) * 100)}%` }} />
          </span>}
        </button>
      </li>;
    })}
  </ol>;
}
