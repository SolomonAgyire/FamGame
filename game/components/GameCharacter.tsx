'use client';

export type GameCharacterId = 'nuri' | 'tali' | 'boaz' | 'mira';
export type GameCharacterMood = 'idle' | 'think' | 'cheer' | 'oops' | 'urgent';

const CHARACTER_NAMES: Record<GameCharacterId, string> = {
  nuri: 'Nuri the camel',
  tali: 'Tali the hoopoe',
  boaz: 'Boaz the lion',
  mira: 'Mira the fennec fox',
};

function artworkMood(mood: GameCharacterMood): 'idle' | 'cheer' | 'oops' {
  if (mood === 'cheer') return 'cheer';
  if (mood === 'oops') return 'oops';
  return 'idle';
}

/** Transparent rendered pose art keeps the whole cast in the painted world. */
export function GameCharacter({ character, mood = 'idle', size = 'medium', className = '' }: {
  character: GameCharacterId;
  mood?: GameCharacterMood;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}) {
  const label = `${CHARACTER_NAMES[character]} ${mood === 'cheer' ? 'cheering' : mood === 'oops' ? 'encouraging you' : mood === 'urgent' ? 'watching the clock' : mood === 'think' ? 'thinking' : 'ready to play'}`;
  const pose = artworkMood(mood);
  return <div className={`game-character rendered-character character-${character} mood-${mood} character-${size} ${className}`} role="img" aria-label={label}>
    <span
      className="character-render"
      style={{ '--character-art': `url('/art/characters/${character}-${pose}.png')` } as React.CSSProperties}
      aria-hidden="true"
    />
  </div>;
}
