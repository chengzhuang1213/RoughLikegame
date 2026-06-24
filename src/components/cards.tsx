import type { Character, CharacterTemplate } from '../game';
import { GROUP_LABELS, RARITY_LABELS, ROLE_LABELS } from '../game';
import { Avatar } from './common';
import { groupDetail, InfoPill, rarityDetail, roleDetail } from './info';
import { getCompactAbilityDescription, getUpgradeEffectLines, HighlightChangedValues, HighlightText, UpgradePreview } from '../game/data/upgrades';

interface TemplateCardProps {
  template: CharacterTemplate;
  selected?: boolean;
  disabled?: boolean;
  footer?: string;
  onClick?: () => void;
}

export function TemplateCard({ template, selected = false, disabled = false, footer, onClick }: TemplateCardProps) {
  const identityLabel = template.bossTier
    ? `第${template.bossTier}层 Boss`
    : template.eliteTier
      ? `第${template.eliteTier}层精英`
      : template.enemyTier === 'weak'
        ? '弱怪'
        : template.enemyTier === 'strong'
          ? '强怪'
          : GROUP_LABELS[template.group];

  return (
    <button
      className={`character-card rarity-${template.rarity} ${selected ? 'selected' : ''}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Avatar character={template} label={template.name} />
      <div className="card-copy">
        <strong>{template.name}</strong>
        <div className="card-tags">
          <div className="card-tag-row bond-row">
            <InfoPill className="group-tag" label={identityLabel} tooltip={template.enemyTier || template.eliteTier || template.bossTier ? rarityDetail(template.rarity) : groupDetail(template.group)} />
          </div>
          <div className="card-tag-row meta-row">
            <InfoPill className={`rarity-tag rarity-${template.rarity}`} label={RARITY_LABELS[template.rarity]} tooltip={rarityDetail(template.rarity)} />
            {template.role && <InfoPill className="group-tag" label={ROLE_LABELS[template.role]} tooltip={roleDetail(template.role)} />}
          </div>
        </div>
        <span>
          HP {template.maxHp} · 攻 {template.attack} · 速 {template.speed}
        </span>
        {template.passive && (
          <>
          <small className="skill-preview-trigger" tabIndex={0}>
            {`被动「${template.passive.name}」：${getCompactAbilityDescription(template.passive.description)}`}
          </small>
          <UpgradePreview template={template} />
          </>
        )}
        <small className="skill-preview-trigger" tabIndex={0}>
          {`技能「${template.skill.name}」：${getCompactAbilityDescription(template.skill.description)}`}
        </small>
        <UpgradePreview template={template} />
        {template.feature && <small>定位：{template.feature}</small>}
        {footer && <em>{footer}</em>}
      </div>
    </button>
  );
}

interface CharacterCardProps {
  character: Character;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function CharacterCard({ character, selected = false, disabled = false, onClick }: CharacterCardProps) {
  const identityLabel = character.bossTier
    ? `第${character.bossTier}层 Boss`
    : character.eliteTier
      ? `第${character.eliteTier}层精英`
      : character.enemyTier === 'weak'
        ? '弱怪'
        : character.enemyTier === 'strong'
          ? '强怪'
          : GROUP_LABELS[character.group];
  const level = character.upgradeLevel ?? 1;
  const upgradeLines = getUpgradeEffectLines(character.templateId, level);
  const baseUpgradeLines = getUpgradeEffectLines(character.templateId, 1);

  return (
    <button
      className={`character-card rarity-${character.rarity} ${selected ? 'selected' : ''} ${character.injured ? 'injured' : ''}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Avatar character={character} label={character.name.replace('对手 ', '').replace('敌方', '').replace('Boss ', '').replace('精英 ', '')} />
      <div className="card-copy">
        <strong>{character.name}</strong>
        <div className="card-tags">
          <div className="card-tag-row bond-row">
            <InfoPill className="group-tag" label={identityLabel} tooltip={character.enemyTier || character.eliteTier || character.bossTier ? rarityDetail(character.rarity) : groupDetail(character.group)} />
          </div>
          <div className="card-tag-row meta-row">
            <InfoPill className={`rarity-tag rarity-${character.rarity}`} label={RARITY_LABELS[character.rarity]} tooltip={rarityDetail(character.rarity)} />
            {character.role && <InfoPill className="group-tag" label={ROLE_LABELS[character.role]} tooltip={roleDetail(character.role)} />}
          </div>
        </div>
        <span>
          HP {character.hp}/{character.maxHp} · 攻 {character.attack} · 速 {character.speed}
          {character.rarity !== 'enemy' && character.rarity !== 'elite' && character.rarity !== 'boss' ? ` LV${level}` : ''}
        </span>
        {(character.shield > 0 || character.poison > 0 || character.vulnerable > 0 || character.shieldGainReduced || character.healingReduced) && (
          <span>
            {character.shield > 0 ? `护盾 ${character.shield} ` : ''}
            {character.poison > 0 ? `毒 ${character.poison} ` : ''}
            {character.vulnerable > 0 ? '易损 ' : ''}
            {character.shieldGainReduced ? '护盾削弱 ' : ''}
            {character.healingReduced ? '回血削弱 ' : ''}
          </span>
        )}
        {upgradeLines.length > 0 ? (
          upgradeLines.map((line, index) => (
            <small key={line}>
              <HighlightChangedValues text={line} baseText={baseUpgradeLines[index] ?? ''} />
            </small>
          ))
        ) : (
          <>
            {character.passive && (
              <small>
                <HighlightText text={`被动「${character.passive.name}」：${character.passive.description}`} />
              </small>
            )}
            <small>
              <HighlightText text={`技能「${character.skill.name}」：${character.skill.description}`} />
            </small>
          </>
        )}
        {character.feature && <small>定位：{character.feature}</small>}
        {character.mechanic && <small>终极机制：{character.mechanic}</small>}
        {character.injured && <em>重伤</em>}
      </div>
    </button>
  );
}
