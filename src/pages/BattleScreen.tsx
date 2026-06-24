import type { CSSProperties } from 'react';
import type { BattleState, BossTemplate, BossTier, Character } from '../game';
import {
  GROUP_LABELS,
  NODE_LABELS,
  RARITY_LABELS,
  ROLE_LABELS,
  getActiveBonds,
  getActiveSecondaryBonds,
} from '../game';
import { BOND_LOGO_SRC } from '../assets';
import { Avatar, UpgradeLevelBadge } from '../components/common';
import { BattleLog } from '../components/battleLog';
import { CharacterCard } from '../components/cards';
import { EnhanceModal } from '../components/EnhanceModal';
import { InfoPill, rarityDetail, roleDetail } from '../components/info';
import { HighlightText } from '../game/data/upgrades';

export interface BattleScreenProps {
  battle: BattleState;
  boss: BossTemplate;
  gold: number;
  team: Character[];
  onContinue: () => void;
  onToggleSelection: (id: string) => void;
  pendingEnhance: { source: 'elite' | 'boss'; cost: number; free: boolean } | null;
  pendingBossVictory: boolean;
  onStart: () => void;
  onEnhance: (id: string | null) => void;
  onDismissEnhancement: () => void;
  onBossBack: () => void;
  onBossBlessing: () => void;
}

function hpPercent(character: Pick<Character, 'hp' | 'maxHp'>) {
  return `${Math.max(0, Math.min(100, Math.round((character.hp / character.maxHp) * 100)))}%`;
}

function BattleUnitCard({ character, defeated = false }: { character: Character; defeated?: boolean }) {
  return (
    <div className={`battle-unit-card rarity-${character.rarity} ${defeated || character.hp <= 0 ? 'defeated' : ''}`}>
      <Avatar character={character} label={character.name.replace('对手 ', '').replace('敌方', '').replace('Boss ', '').replace('精英 ', '')} />
      <div className="battle-unit-copy">
        <div className="battle-unit-title">
          <strong>{character.name}</strong>
          {character.rarity !== 'enemy' && character.rarity !== 'elite' && character.rarity !== 'boss' && <UpgradeLevelBadge level={character.upgradeLevel ?? 1} />}
          <InfoPill className="battle-title-pill" label={RARITY_LABELS[character.rarity]} tooltip={rarityDetail(character.rarity)} />
          {character.role && <InfoPill className="battle-title-pill" label={ROLE_LABELS[character.role]} tooltip={roleDetail(character.role)} />}
        </div>
        <div className="battle-hp-line">
          <b>HP {character.hp}/{character.maxHp}</b>
          <div className="battle-hp-track"><span style={{ width: hpPercent(character) }} /></div>
        </div>
        <small>攻击 {character.attack}　速度 {character.speed}</small>
        {character.passive && <small><HighlightText text={`被动：${character.passive.description}`} /></small>}
        {character.skill && <small><HighlightText text={`技能：${character.skill.description}`} /></small>}
      </div>
    </div>
  );
}

function BattleTeamPanel({ team }: { team: Character[] }) {
  const slots = Array.from({ length: 4 }, (_, index) => team[index] ?? null);
  const primaryBonds = getActiveBonds(team).filter((bond) => bond.count > 0);
  const secondaryBonds = getActiveSecondaryBonds(team).filter((bond) => bond.count > 0);
  const visibleBonds = [
    ...primaryBonds.map((bond) => ({
      id: bond.group.id,
      name: bond.group.name,
      count: bond.count,
      total: 3,
      active: bond.level > 0,
      description: bond.level >= 3 ? bond.group.level3Description : bond.level >= 2 ? bond.group.level2Description : `${bond.group.level2Description} ${bond.group.level3Description}`,
      logoSrc: BOND_LOGO_SRC[bond.group.id],
    })),
    ...secondaryBonds.map((activeBond) => ({
      id: activeBond.bond.id,
      name: activeBond.bond.name,
      count: activeBond.count,
      total: 2,
      active: activeBond.active,
      description: activeBond.bond.description,
      logoSrc: BOND_LOGO_SRC[activeBond.bond.id],
    })),
  ].sort((left, right) => Number(right.active) - Number(left.active) || right.count - left.count || right.total - left.total);

  return (
    <aside className="battle-left-panel">
      <section className="battle-card-panel battle-team-compact-panel">
        <h3>队伍</h3>
        <div className="battle-team-avatar-grid">
          {slots.map((member, index) =>
            member ? (
              <div className={`battle-mini-item rarity-${member.rarity} ${member.injured || member.hp <= 0 ? 'injured' : ''}`} key={member.id} tabIndex={0}>
                <Avatar character={member} label={member.name} />
                <div className="battle-mini-popover">
                  <strong>{member.name}</strong>
                  <span>{RARITY_LABELS[member.rarity]} · {GROUP_LABELS[member.group]}{member.role ? ` · ${ROLE_LABELS[member.role]}` : ''} · LV{member.upgradeLevel ?? 1}</span>
                  <span>HP {member.hp}/{member.maxHp} · 攻 {member.attack} · 速 {member.speed}</span>
                  {member.passive && <small><HighlightText text={`被动：${member.passive.description}`} /></small>}
                  {member.skill && <small><HighlightText text={`技能：${member.skill.description}`} /></small>}
                </div>
              </div>
            ) : (
              <div className="battle-mini-empty" key={`empty-${index}`}>＋</div>
            ),
          )}
        </div>
        <h3>羁绊</h3>
        <div className="battle-bond-logo-grid">
          {visibleBonds.length > 0 ? (
            visibleBonds.map((bond) => (
              <div className={`battle-bond-logo-item ${bond.active ? 'active' : 'inactive'}`} key={bond.id} tabIndex={0}>
                <img src={bond.logoSrc} alt="" />
                <div className="battle-mini-popover">
                  <strong>{bond.name} {bond.count}/{bond.total}</strong>
                  <span>{bond.description}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="battle-bond-empty">暂无羁绊</div>
          )}
        </div>
      </section>
    </aside>
  );
}

function BattleSlotStrip({ selectedMembers, slots }: { selectedMembers: Character[]; slots: number }) {
  const slotItems = Array.from({ length: slots }, (_, index) => selectedMembers[index] ?? null);

  return (
    <section className="battle-slot-strip" aria-label="出战位" style={{ '--slot-count': slots } as CSSProperties}>
      {slotItems.map((member, index) => (
        <div className={`battle-slot ${member ? 'filled' : ''}`} key={member?.id ?? `slot-${index}`}>
          {member ? (
            <>
              <Avatar character={member} label={member.name} />
              <span>{member.hp}/{member.maxHp} HP</span>
            </>
          ) : (
            <>
              <b>＋</b>
              <span>空缺</span>
            </>
          )}
        </div>
      ))}
    </section>
  );
}
function BossContinueModal({ tier, onBack, onBlessing }: { tier: BossTier; onBack: () => void; onBlessing: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="reward-modal boss-victory-modal">
        <p className="eyebrow">Boss胜利</p>
        <h3>胜利！解锁第{tier + 1}层！</h3>
        <p>可以先返回查看战斗结果，也可以进入祝福处开启下一层前的回复。</p>
        <div className="action-row">
          <button className="secondary-button" onClick={onBack}>返回</button>
          <button className="primary-button" onClick={onBlessing}>进入祝福处</button>
        </div>
      </div>
    </div>
  );
}

export function BattleScreen({ battle, boss, gold, team, pendingEnhance, pendingBossVictory, onContinue, onToggleSelection, onStart, onEnhance, onDismissEnhancement, onBossBack, onBossBlessing }: BattleScreenProps) {
  const aliveMembers = team.filter((member) => !member.injured && member.hp > 0);
  const displayEnemy = battle.enemies[Math.min(battle.activeEnemyIndex, battle.enemies.length - 1)] ?? null;
  const selectableMembers = battle.phase === 'relay' ? aliveMembers : team;
  const selectedMembers = battle.selectedIds
    .map((id) => team.find((member) => member.id === id))
    .filter((member): member is Character => Boolean(member));
  const battleTitle = battle.type === 'boss' ? '3v1 Boss战' : battle.type === 'elite' ? '2v1 精英战' : '1v1 普通战斗';
  const canStart = (battle.phase === 'select' || battle.phase === 'relay') && battle.selectedIds.length === battle.slots;
  const isWon = battle.phase === 'won';
  const isBossWon = isWon && battle.type === 'boss' && boss.bossTier < 3;
  const canContinueRoute = isWon && !isBossWon && !pendingEnhance;

  return (
    <div className="battle-hud-screen">
      <header className="battle-hud-header">
        <div>
          <p className="eyebrow">{NODE_LABELS[battle.type]}</p>
          <h2>{battleTitle}</h2>
          <p>所选角色会同时出战，敌人会攻击所有出战角色。</p>
        </div>
        <div className="battle-resource-pills">
          <span data-tooltip="金币：用于商店招募、休息处治疗复活，以及部分强化费用。" tabIndex={0}>◎ 金币 {gold}</span>
          <span data-tooltip="伙伴：当前队伍总人数，上限为4人。" tabIndex={0}>伙伴 {team.length}</span>
          <span data-tooltip="可出战：未重伤且生命值大于0的伙伴数量。" tabIndex={0}>可出战 {aliveMembers.length}</span>
        </div>
      </header>

      <div className="battle-hud-grid">
        <BattleTeamPanel team={team} />

        <main className="battle-center-panel">
          <section className="battle-card-panel battle-enemy-stage">
            <h3>敌人</h3>
            {displayEnemy && <BattleUnitCard character={displayEnemy} defeated={displayEnemy.hp <= 0 || isWon} />}
          </section>

          <section className="battle-card-panel battle-selection-stage">
            <div className="battle-section-heading">
              <h3>{battle.phase === 'relay' ? '接力出战' : isWon ? '战斗结果' : '选择出战角色'} {battle.selectedIds.length}/{battle.slots}</h3>
              {battle.phase === 'relay' && displayEnemy && <span>{displayEnemy.name} 剩余 {displayEnemy.hp}/{displayEnemy.maxHp} HP</span>}
            </div>

            <div className="battle-selection-top">
              <BattleSlotStrip selectedMembers={selectedMembers} slots={battle.slots} />
              {(battle.phase === 'select' || battle.phase === 'relay') && (
                <div className="battle-slot-actions">
                  <button className="primary-button battle-start-button" disabled={!canStart} onClick={onStart}>
                    {battle.phase === 'relay' ? '开始接力战斗' : '开始自动战斗'}
                  </button>
                </div>
              )}
            </div>

            {(battle.phase === 'select' || battle.phase === 'relay') && (
              <div className="battle-candidate-grid">
                {selectableMembers.map((member) => (
                  <CharacterCard
                    key={member.id}
                    character={member}
                    selected={battle.selectedIds.includes(member.id)}
                    disabled={member.injured || member.hp <= 0}
                    onClick={() => onToggleSelection(member.id)}
                  />
                ))}
              </div>
            )}

            {isWon && (
              <div className="battle-result-banner">
                <strong>战斗胜利</strong>
                <span>敌方生命已归零，我方保留战后生命值。</span>
              </div>
            )}
          </section>

          <div className="battle-bottom-actions">
            {canContinueRoute && (
              <button className="primary-button battle-start-button" onClick={onContinue}>继续路线</button>
            )}
            {isBossWon && !pendingEnhance && !pendingBossVictory && (
              <button className="primary-button battle-start-button" onClick={onBossBlessing}>进入祝福处</button>
            )}
          </div>
        </main>

        <aside className="battle-right-panel">
          <BattleLog entries={battle.log} stats={battle.stats} team={team} />
        </aside>
      </div>

      {pendingEnhance && (
        <EnhanceModal
          gold={gold}
          pending={pendingEnhance}
          team={team}
          onEnhance={onEnhance}
          onDismiss={onDismissEnhancement}
        />
      )}
      {pendingBossVictory && isBossWon && (
        <BossContinueModal tier={boss.bossTier} onBack={onBossBack} onBlessing={onBossBlessing} />
      )}
    </div>
  );
}
