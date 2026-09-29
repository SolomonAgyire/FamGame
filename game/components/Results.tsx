'use client';

import type { ReactNode } from 'react';
import { RewardStars } from '@/components/GameChrome';
import { GameCharacter, type GameCharacterId } from '@/components/GameCharacter';

export type ResultStat = { label: string; value: string | number };

/** The one results shell every mode's finish screen renders into: stars,
 * mascot, headline, an optional coins-earned and scripture-reward line, an
 * optional gem callout, mode-specific extra content (a leaderboard, a
 * streak header, ...), a stat grid, and one dominant primary action. */
export function Results({
  character = 'nuri', stars, subtitle, title, banner, headline, coinsEarned, gemEarned, scripture, extra, stats,
  primaryLabel, onPrimary, secondaryAction, onHome,
}: {
  character?: GameCharacterId;
  stars: number;
  subtitle: string;
  title: string;
  banner?: ReactNode;
  headline: { value: string | number; label: string };
  coinsEarned?: number;
  gemEarned?: boolean;
  scripture?: string;
  extra?: ReactNode;
  stats: ResultStat[];
  primaryLabel: string;
  onPrimary: () => void;
  secondaryAction?: ReactNode;
  onHome: () => void;
}) {
  return <main className="page-shell result-stage"><section className="panel results-panel result-popup">
    <div className={`result-mascot result-mascot-${stars >= 2 ? 'happy' : 'brave'}`}>
      <GameCharacter character={character} mood={stars >= 2 ? 'cheer' : 'oops'} size="large" />
    </div>
    <RewardStars earned={stars} />
    <p className="section-kicker">{subtitle}</p>
    <h1 className="page-title">{title}</h1>
    {banner}
    <div className="result-score"><strong>{headline.value}</strong><span>{headline.label}</span></div>
    {coinsEarned !== undefined && <div className="reward-scroll"><span aria-hidden="true">✦</span><div><small>Coins earned</small><strong>+{coinsEarned}</strong></div><span aria-hidden="true">✦</span></div>}
    {scripture && <div className="scripture-book" role="status"><span className="scripture-book-icon" aria-hidden="true">📖</span><div><small>Scripture reward</small><strong>{scripture}</strong></div></div>}
    {gemEarned && <p className="gem-earned-banner" role="status"><span aria-hidden="true">💎</span> New gem earned!</p>}
    {extra}
    <div className="stat-grid">{stats.map((stat) => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}</div>
    <div className="result-actions">
      <button className="primary-button" type="button" onClick={onPrimary}>{primaryLabel}</button>
      {secondaryAction}
      <button className="text-button" type="button" onClick={onHome}>Map</button>
    </div>
  </section></main>;
}
