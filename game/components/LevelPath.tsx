'use client';

import { useEffect, useState } from 'react';
import { loadProgress, type ProgressRecord } from '@/lib/progress';
import { levelStatus } from '@/lib/levels';
import { emptyProgress } from '@/lib/progress';
import type { Level } from '@/lib/types';

const LEVELS: Level[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function LevelPath({ selected, onSelect }: { selected: Level; onSelect: (level: Level) => void }) {
  // Read storage after mount so the server and first client render agree.
  const [record, setRecord] = useState<ProgressRecord>(() => emptyProgress());
  useEffect(() => { setRecord(loadProgress()); }, []);

  return <ol className="level-path" aria-label="Your journey">
    {LEVELS.map((level) => {
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
          {status.unlocked && !status.cleared && <span className="level-meter" aria-hidden="true">
            <i style={{ width: `${Math.min(100, (status.solved / status.needed) * 100)}%` }} />
          </span>}
        </button>
      </li>;
    })}
  </ol>;
}
