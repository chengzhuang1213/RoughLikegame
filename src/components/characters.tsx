import type { Character } from '../game';
import { GROUP_LABELS, RARITY_LABELS, ROLE_LABELS } from '../game';
import { Avatar } from './common';

export function CompactCharacter({ character }: { character: Character }) {
  const hpPercent = Math.max(0, Math.round((character.hp / character.maxHp) * 100));
  const levelText = character.rarity !== 'enemy' && character.rarity !== 'elite' && character.rarity !== 'boss'
    ? ` LV${character.upgradeLevel ?? 1}`
    : '';

  return (
    <div className={`compact-character rarity-${character.rarity} ${character.injured ? 'injured' : ''}`}>
      <Avatar character={character} label={character.name} small />
      <div className="compact-copy">
        <div>
          <div className="character-name-line compact">
            <strong>{character.name}</strong>
          </div>
          <span>{RARITY_LABELS[character.rarity]} · {GROUP_LABELS[character.group]}{character.role ? ` · ${ROLE_LABELS[character.role]}` : ''}{levelText} · {character.injured ? '重伤' : `${character.hp}/${character.maxHp} HP`}</span>
        </div>
        <div className="hp-track" aria-label={`${character.name}生命值`}>
          <span style={{ width: `${hpPercent}%` }} />
        </div>
      </div>
    </div>
  );
}
