import { useEffect, useState } from 'react';
import type { Character } from '../game';
import { Avatar } from '../components/common';

export type HealType = 'small' | 'large';

const HEAL_OPTIONS: Record<HealType, { label: string; cost: number; amount: number; full?: boolean }> = {
  small: { label: '???', cost: 20, amount: 15 },
  large: { label: '???', cost: 50, amount: 50 },
};
const REVIVE_COST = 40;

export interface RestScreenProps {
  gold: number;
  team: Character[];
  healUsed: boolean;
  reviveUsed: boolean;
  onHeal: (id: string, healType: HealType) => void;
  onRevive: (id: string) => void;
  onLeave: () => void;
}

type RestAction = HealType | 'revive';

export function RestScreen({ gold, team, healUsed, reviveUsed, onHeal, onRevive, onLeave }: RestScreenProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<RestAction | null>(null);
  const [pendingAction, setPendingAction] = useState<{ action: RestAction; targetId: string } | null>(null);
  const selectedMember = team.find((member) => member.id === selectedId) ?? null;
  const pendingMember = pendingAction ? team.find((member) => member.id === pendingAction.targetId) ?? null : null;

  const isActionAvailable = (action: RestAction) => {
    if (action === 'revive') {
      return !reviveUsed && gold >= REVIVE_COST && team.some((member) => member.injured);
    }
    return !healUsed && gold >= HEAL_OPTIONS[action].cost && team.some((member) => !member.injured && member.hp < member.maxHp);
  };

  const isValidTarget = (action: RestAction, member: Character) => {
    if (action === 'revive') {
      return !reviveUsed && member.injured && gold >= REVIVE_COST;
    }
    return !healUsed && !member.injured && member.hp < member.maxHp && gold >= HEAL_OPTIONS[action].cost;
  };

  const getActionLabel = (action: RestAction) => action === 'revive' ? '复活' : HEAL_OPTIONS[action].label;
  const getActionCost = (action: RestAction) => action === 'revive' ? REVIVE_COST : HEAL_OPTIONS[action].cost;
  const getActionPreview = (action: RestAction, member: Character) => {
    if (action === 'revive') {
      return `复活后恢复到 ${Math.max(1, Math.ceil(member.maxHp * 0.3))}/${member.maxHp} HP。`;
    }
    const nextHp = Math.min(member.maxHp, member.hp + HEAL_OPTIONS[action].amount);
    return `${member.hp}/${member.maxHp} HP → ${nextHp}/${member.maxHp} HP。`;
  };

  useEffect(() => {
    if (selectedAction && !isActionAvailable(selectedAction)) {
      setSelectedAction(null);
      setPendingAction(null);
    }
  }, [gold, healUsed, reviveUsed, selectedAction, team]);

  function chooseAction(action: RestAction) {
    if (!isActionAvailable(action)) {
      return;
    }
    setSelectedAction(action);
    setPendingAction(null);
    setSelectedId(null);
  }

  function chooseTarget(member: Character) {
    setSelectedId(member.id);
    if (!selectedAction || !isValidTarget(selectedAction, member)) {
      return;
    }
    setPendingAction({ action: selectedAction, targetId: member.id });
  }

  function confirmRestAction() {
    if (!pendingAction || !pendingMember || !isValidTarget(pendingAction.action, pendingMember)) {
      return;
    }
    if (pendingAction.action === 'revive') {
      onRevive(pendingMember.id);
    } else {
      onHeal(pendingMember.id, pendingAction.action);
    }
    setSelectedAction(null);
    setSelectedId(null);
    setPendingAction(null);
  }

  const canSmallHeal = isActionAvailable('small');
  const canLargeHeal = isActionAvailable('large');
  const canRevive = isActionAvailable('revive');

  return (
    <div className="flow-screen rest-screen">
      <div className="rest-blessing-panel rest-panel">
        <div className="rest-blessing-heading">
          <div>
            <p className="eyebrow">休息处</p>
            <h2>☕ 休息处</h2>
            <p>先选择治疗或复活，再点击目标队员，确认后生效。每个休息处最多治疗一次、复活一次。</p>
          </div>
          <div className="rest-usage-card">
            <small>本次剩余</small>
            <span className={healUsed ? 'used' : ''}>治疗 {healUsed ? '0/1' : '1/1'}</span>
            <span className={reviveUsed ? 'used' : ''}>复活 {reviveUsed ? '0/1' : '1/1'}</span>
          </div>
        </div>

        <div className="rest-action-cards">
          <button className={`rest-action-card rest-action-small ${selectedAction === 'small' ? 'selected' : ''}`} disabled={!canSmallHeal} onClick={() => chooseAction('small')} type="button">
            <strong>小治疗</strong>
            <img src="/ui/rest-actions/small-heal.png" alt="" />
            <span>恢复目标 {HEAL_OPTIONS.small.amount} 点生命值。</span>
            <em>消耗 {HEAL_OPTIONS.small.cost} 金币</em>
          </button>
          <button className={`rest-action-card rest-action-large ${selectedAction === 'large' ? 'selected' : ''}`} disabled={!canLargeHeal} onClick={() => chooseAction('large')} type="button">
            <strong>大治疗</strong>
            <img src="/ui/rest-actions/large-heal.png" alt="" />
            <span>恢复目标 {HEAL_OPTIONS.large.amount} 点生命值。</span>
            <em>消耗 {HEAL_OPTIONS.large.cost} 金币</em>
          </button>
          <button className={`rest-action-card rest-action-revive ${selectedAction === 'revive' ? 'selected' : ''}`} disabled={!canRevive} onClick={() => chooseAction('revive')} type="button">
            <strong>复活</strong>
            <img src="/ui/rest-actions/revive.png" alt="" />
            <span>复活一名重伤队员，并恢复30%最大生命。</span>
            <em>消耗 {REVIVE_COST} 金币</em>
          </button>
        </div>

        <div className="rest-team-status" aria-label="队伍状态">
          <strong>{selectedAction ? `选择${getActionLabel(selectedAction)}目标` : '队伍状态'}</strong>
          <div className="rest-team-members">
            {Array.from({ length: 4 }, (_, index) => team[index] ?? null).map((member, index) => (
              member ? (
                <button
                  className={`rest-status-member rarity-${member.rarity} ${selectedId === member.id ? 'selected' : ''} ${member.injured ? 'injured' : ''} ${selectedAction && isValidTarget(selectedAction, member) ? 'targetable' : ''} ${selectedAction && !isValidTarget(selectedAction, member) ? 'not-targetable' : ''}`}
                  key={member.id}
                  onClick={() => chooseTarget(member)}
                  type="button"
                >
                  <Avatar character={member} label={member.name} small />
                  <span>{member.name}</span>
                  <small>{member.injured ? '重伤' : `${member.hp} / ${member.maxHp}`}</small>
                  <div className="hp-track" aria-label={`${member.name}生命值`}>
                    <span style={{ width: `${Math.max(0, Math.round((member.hp / member.maxHp) * 100))}%` }} />
                  </div>
                </button>
              ) : (
                <div className="rest-status-member empty" key={`empty-${index}`}>
                  <span>未上阵</span>
                </div>
              )
            ))}
          </div>
        </div>
      </div>
      {pendingAction && pendingMember && (
        <div className="modal-backdrop" role="presentation" onClick={() => setPendingAction(null)}>
          <section className="reward-modal rest-confirm-modal" role="dialog" aria-modal="true" aria-label="休息处确认" onClick={(event) => event.stopPropagation()}>
            <p className="eyebrow">二次确认</p>
            <h3>确认{getActionLabel(pendingAction.action)} {pendingMember.name}？</h3>
            <div className="rest-confirm-target">
              <Avatar character={pendingMember} label={pendingMember.name} small />
              <div>
                <strong>{pendingMember.name}</strong>
                <span>{pendingMember.injured ? '重伤' : `${pendingMember.hp}/${pendingMember.maxHp} HP`}</span>
              </div>
            </div>
            <p>{getActionPreview(pendingAction.action, pendingMember)}</p>
            <p>本次将消耗 {getActionCost(pendingAction.action)} 金币。</p>
            <div className="action-row">
              <button className="secondary-button" type="button" onClick={() => setPendingAction(null)}>
                取消
              </button>
              <button className="primary-button" type="button" onClick={confirmRestAction}>
                确认{getActionLabel(pendingAction.action)}
              </button>
            </div>
          </section>
        </div>
      )}
      <button className="primary-button rest-leave-button" onClick={onLeave}>
        ✦ 离开休息处 ✦
        <small>进入下一层</small>
      </button>
    </div>
  );
}
