import type { CSSProperties } from 'react';
import type { Character, CharacterTemplate } from '../game';

export function portraitStyle(character: Pick<Character | CharacterTemplate, 'color' | 'accent'>): CSSProperties {
  return {
    '--tone': character.color,
    '--accent': character.accent,
  } as CSSProperties;
}

function getInitial(name: string) {
  return name.slice(0, 1);
}

export function UpgradeLevelBadge({ level }: { level: number }) {
  return <span className="level-badge">LV{level}</span>;
}

export function MusicToggleButton({ muted, onToggle, className = '' }: { muted: boolean; onToggle: () => void; className?: string }) {
  return (
    <button className={`music-toggle ${className}`.trim()} type="button" onClick={onToggle} aria-label={muted ? 'BGM off' : 'BGM on'}>
      {muted ? 'BGM OFF' : 'BGM ON'}
    </button>
  );
}

interface AvatarProps {
  character: Pick<Character | CharacterTemplate, 'color' | 'accent' | 'avatar'>;
  label: string;
  small?: boolean;
}

export function Avatar({ character, label, small = false }: AvatarProps) {
  return (
    <div className={`avatar ${small ? 'small' : ''}`} style={portraitStyle(character)}>
      <span className="avatar-fallback">{getInitial(label)}</span>
      <img
        aria-hidden="true"
        className="avatar-image"
        src={character.avatar}
        alt=""
        onError={(event) => {
          event.currentTarget.style.display = 'none';
        }}
      />
    </div>
  );
}
