import type { BossTier, Character } from '../game';
import { GROUP_LABELS, RARITY_LABELS, ROLE_LABELS } from '../game';
import { Avatar } from '../components/common';

export interface BlessingScreenProps {
  team: Character[];
  tier: BossTier;
  onContinue: () => void;
}

export function BlessingScreen({ team, tier, onContinue }: BlessingScreenProps) {
  return (
    <div className="flow-screen blessing-screen">
      <div className="rest-blessing-panel blessing-panel">
        <div className="rest-blessing-heading">
          <div>
            <p className="eyebrow">祝福处</p>
            <h2>✦ 祝福处 ✦</h2>
            <p>Boss战后的温柔祝福：全员解除重伤，生命值至少恢复到最大生命的50%。</p>
          </div>
          <div className="blessing-chance-card">
            <small>本次祝福</small>
            <strong>全队恢复</strong>
            <span>自动生效</span>
          </div>
        </div>

        <div className="blessing-member-list">
          {team.map((member) => (
            <div className={`blessing-member-card rarity-${member.rarity}`} key={member.id}>
              <Avatar character={member} label={member.name} />
              <div className="blessing-member-copy">
                <strong>{member.name}</strong>
                <span>LV{member.upgradeLevel ?? 1} · {RARITY_LABELS[member.rarity]} · {GROUP_LABELS[member.group]}{member.role ? ` · ${ROLE_LABELS[member.role]}` : ''}</span>
                <small>{member.hp} / {member.maxHp} HP</small>
                <div className="hp-track" aria-label={`${member.name}生命值`}>
                  <span style={{ width: `${Math.max(0, Math.round((member.hp / member.maxHp) * 100))}%` }} />
                </div>
              </div>
              <div className="blessing-status-card">
                <strong>已祝福</strong>
                <span>状态已恢复</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <button className="primary-button rest-leave-button" onClick={onContinue}>
        ✦ 进入第{tier}层 ✦
      </button>
    </div>
  );
}
