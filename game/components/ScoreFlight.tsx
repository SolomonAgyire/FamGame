'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

type Flight = { id: number; points: number; x: number; y: number; dx: number; dy: number };

/** Decorative only: score updates remain immediate. Mount beside the score
 * that receives the points, and measure the actual board and target so the
 * flight also works after scrolling or with a multi-line team scoreboard. */
export function ScoreFlight({ score, initialScore = score }: { score: number; initialScore?: number }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const previous = useRef(initialScore);
  const [flight, setFlight] = useState<Flight | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      const points = score - previous.current;
      previous.current = score;
      setFlight(null);
      if (points <= 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const target = anchor.current?.parentElement;
      const source = target?.closest('main')?.querySelector('.answer-area, .page-title');
      if (!source || !target) return;
      const start = source.getBoundingClientRect();
      const end = target.getBoundingClientRect();
      // Do not launch a reward from or towards an off-screen element.
      if (start.bottom < 0 || start.top > window.innerHeight || end.bottom < 0 || end.top > window.innerHeight) return;
      const x = start.left + start.width / 2;
      const y = start.top + start.height / 2;
      setFlight({ id: performance.now(), points, x, y, dx: end.left + end.width / 2 - x, dy: end.top + end.height / 2 - y });
      timer = window.setTimeout(() => setFlight(null), 900);
    });
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [score]);

  return <>
    <span ref={anchor} className="score-flight-anchor" aria-hidden="true" />
    {flight && createPortal(<span key={flight.id} className="score-flight" aria-hidden="true" style={{
      left: flight.x, top: flight.y, '--flight-x': `${flight.dx}px`, '--flight-y': `${flight.dy}px`,
    } as CSSProperties}><span>✦</span> +{flight.points}</span>, document.body)}
  </>;
}
