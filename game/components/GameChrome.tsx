'use client';

import type { ReactNode } from 'react';

export function GameTool({ icon, label, onClick, disabled = false, count, tone = 'aqua', className = '' }: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  count?: number | string;
  tone?: 'aqua' | 'gold' | 'coral' | 'violet';
  className?: string;
}) {
  return <button
    type="button"
    className={`game-tool game-tool-${tone} ${className}`}
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
  >
    <span className="game-tool-icon" aria-hidden="true">{icon}</span>
    {count !== undefined && <b className="game-tool-count" aria-hidden="true">{count}</b>}
    <small aria-hidden="true">{label}</small>
  </button>;
}

export function RewardStars({ earned, label = `${earned} of 3 stars` }: { earned: number; label?: string }) {
  const safeEarned = Math.max(0, Math.min(3, earned));
  return <div className="reward-stars" role="img" aria-label={label}>
    {[1, 2, 3].map((star) => <span key={star} className={star <= safeEarned ? 'earned' : ''} style={{ '--star-order': star } as React.CSSProperties}>★</span>)}
  </div>;
}

export function MissionHud({ character, pauseButton, mission, progress, score, timer, urgent = false }: {
  character?: ReactNode;
  pauseButton?: ReactNode;
  mission: string;
  progress: number;
  score?: ReactNode;
  timer?: ReactNode;
  urgent?: boolean;
}) {
  return <div className={`mission-hud${urgent ? ' urgent' : ''}${pauseButton ? ' has-pause' : ''}`}>
    {pauseButton && <div className="mission-hud-pause">{pauseButton}</div>}
    {character && <div className="mission-hud-guide">{character}</div>}
    <div className="mission-hud-progress">
      <strong>{mission}</strong>
      <span aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></span>
    </div>
    {timer && <div className="mission-hud-chip mission-hud-timer">{timer}</div>}
    {score && <div className="mission-hud-chip mission-hud-score">{score}</div>}
  </div>;
}
