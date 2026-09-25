'use client';

import { useState } from 'react';

export type StandingsPlayer = {
  id: string;
  name: string;
  score: number;
  role: 'player' | 'spectator';
  isHost: boolean;
  left: boolean;
};

/** Ranked live standings for an online room. The score strip this replaces
 * was an unsorted flex row in join order that already overflowed at
 * twelve players -- at thirty it was unusable. This sorts by score, keeps
 * the top three and the viewer's own row visible even when collapsed, and
 * marks who has answered the live puzzle without saying whether they were
 * right. Nothing here is virtualised -- thirty rows is small enough to
 * just render. */
export function Standings({ players, viewerId, answeredIds, phase, isHost, onKick }: {
  players: StandingsPlayer[];
  viewerId: string;
  /** Ids who have submitted an answer to the current puzzle, right or
   * wrong -- empty once there is no live puzzle to answer. */
  answeredIds: string[];
  phase: 'play' | 'results';
  /** Only the host gets a kick control, and only during play. */
  isHost?: boolean;
  onKick?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(phase === 'results');
  const open = phase === 'results' || expanded;
  const ranked = [...players]
    .filter((player) => player.role === 'player')
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const spectatorCount = players.filter((player) => player.role === 'spectator' && !player.left).length;
  const viewerIndex = ranked.findIndex((player) => player.id === viewerId);
  const viewerInTop = viewerIndex >= 0 && viewerIndex < 3;
  // Collapsed, only the top three and the viewer's own row show -- that is
  // the whole point: a player 22nd of 30 can still find themselves without
  // opening the full list.
  const compact = ranked.slice(0, 3);
  const showGap = !viewerInTop && viewerIndex >= 3;
  if (showGap) compact.push(ranked[viewerIndex]);
  const rows = open ? ranked : compact;
  return <div className={`standings ${open ? 'standings-open' : 'standings-compact'}`}>
    {phase === 'play' && <button type="button" className="standings-toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={open}>
      {open ? 'Collapse standings ▲' : `Standings · ${ranked.length} playing ▾`}
    </button>}
    <ol className="standings-list">
      {rows.map((player, index) => {
        const rank = ranked.findIndex((item) => item.id === player.id) + 1;
        const gapBefore = !open && showGap && index === rows.length - 1;
        return <li key={player.id}>
          {gapBefore && <p className="standings-gap" aria-hidden="true">⋯</p>}
          <div className={`standings-row ${player.id === viewerId ? 'viewer' : ''} ${player.left ? 'left' : ''} rank-${rank}`}>
            <span className="rank">{rank}</span>
            <span className="name">{player.name}{player.id === viewerId ? ' (you)' : ''}{player.isHost && <small>Host</small>}{player.left && <small>Left</small>}</span>
            <span className="score">{player.score}</span>
            {phase === 'play'
              ? <span className={`standings-dot ${answeredIds.includes(player.id) ? 'answered' : ''}`} aria-label={answeredIds.includes(player.id) ? `${player.name} has answered` : `${player.name} has not answered yet`} />
              : <span />}
            {isHost && !player.isHost && !player.left && onKick
              ? <button type="button" className="standings-kick" aria-label={`Remove ${player.name} from the room`} onClick={() => onKick(player.id)}>✕</button>
              : <span />}
          </div>
        </li>;
      })}
    </ol>
    {phase === 'play' && spectatorCount > 0 && <p className="standings-footer">{spectatorCount} watching</p>}
  </div>;
}
