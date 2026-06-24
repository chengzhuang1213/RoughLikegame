import { useState } from 'react';
import type { Character } from '../game';
import { Avatar, UpgradeLevelBadge } from './common';
import { getEnhancementChangeLines, HighlightText, maxUpgradeLevel } from '../game/data/upgrades';

export interface EnhanceModalProps {
  gold: number;
  pending: { source: 'elite' | 'boss'; cost: number; free: boolean };
  team: Character[];
  onEnhance: (id: string | null) => void;
  onDismiss: () => void;
}

export function EnhanceModal({ gold, pending, team, onEnhance, onDismiss }: EnhanceModalProps) {
  const candidates = team.filter((member) => (member.upgradeLevel ?? 1) < maxUpgradeLevel(member.rarity));
  const canPay = pending.free || gold >= pending.cost;
  const [selectedId, setSelectedId] = useState(candidates[0]?.id ?? null);
  const selected = candidates.find((member) => member.id === selectedId) ?? null;
  const sourceLabel = pending.source === 'boss' ? 'Boss胜利强化' : '精英胜利强化';
  const costLabel = pending.free ? '免费' : `${pending.cost}金币`;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="reward-modal enhance-modal">
        <p className="eyebrow">强化系统</p>
        <h3>{sourceLabel}</h3>
        <p>选择一名偶像强化。白卡最多2星，紫卡和橙卡最多3星。本次费用：{costLabel}。</p>
        <div className="enhance-modal-grid">
          {candidates.map((member) => {
            const level = member.upgradeLevel ?? 1;
            const max = maxUpgradeLevel(member.rarity);
            const nextLevel = Math.min(max, level + 1);
            const changeLines = getEnhancementChangeLines(member.templateId, nextLevel);
            return (
              <button
                className={`enhance-choice rarity-${member.rarity} ${selectedId === member.id ? 'selected' : ''} ${member.injured || member.hp <= 0 ? 'injured' : ''}`}
                disabled={!canPay}
                key={member.id}
                onClick={() => setSelectedId(member.id)}
                type="button"
              >
                <Avatar character={member} label={member.name} />
                <div>
                  <strong>{member.name}</strong>
                  <UpgradeLevelBadge level={level} />
                  {(member.injured || member.hp <= 0) && <small>重伤中，仍可强化</small>}
                </div>
                <div className="upgrade-tooltip">
                  <b>升级变化：LV{level} → LV{nextLevel}</b>
                  {changeLines.map((line) => (
                    <span key={`change-${line}`}>
                      <HighlightText text={line} />
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
        {candidates.length === 0 && <div className="empty-state">当前没有可强化的偶像。</div>}
        {!canPay && <div className="empty-state">金币不足，无法强化。</div>}
        <div className="action-row">
          <button className="secondary-button" onClick={onDismiss}>返回游戏</button>
          <button className="primary-button" disabled={!selected || !canPay} onClick={() => onEnhance(selected?.id ?? null)}>
            确认强化 {costLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
