import type { BattleStats, Character } from '../game';
import { RARITY_LABELS } from '../game';
import { Avatar } from '../components/common';
import { BattleLog, DamageMeter } from '../components/battleLog';
import { HighlightText } from '../game/data/upgrades';

interface ResultState {
  title: string;
  body: string;
  rewardGold: number;
}

export interface ResultScreenProps {
  result: ResultState;
  log: string[];
  stats: BattleStats;
  team: Character[];
  onContinue: () => void;
}

export function ResultScreen({ result, log, stats, team, onContinue }: ResultScreenProps) {
  return (
    <div className="flow-screen">
      <div className="screen-heading">
        <p className="eyebrow">结算</p>
        <h2>{result.title}</h2>
        <p>
          {result.body} 获得 {result.rewardGold} 金币。
        </p>
      </div>
      <DamageMeter stats={stats} team={team} title="伤害统计" />
      <BattleLog entries={log} stats={stats} team={team} />
      <div className="action-row">
        <button className="primary-button" onClick={onContinue}>
          回到地图
        </button>
      </div>
    </div>
  );
}

export interface EndScreenProps {
  title: string;
  body: string;
  log: string[];
  stats?: BattleStats;
  team: Character[];
  enemies?: Character[];
  onRetryBattle?: () => void;
  onRestart: () => void;
}

function hpPercent(character: Pick<Character, 'hp' | 'maxHp'>) {
  return `${Math.max(0, Math.min(100, Math.round((character.hp / character.maxHp) * 100)))}%`;
}

function EnemySurvivorPanel({ enemies }: { enemies: Character[] }) {
  const survivors = enemies.filter((enemy) => enemy.hp > 0);
  const visibleEnemies = survivors.length > 0 ? survivors : enemies;

  if (visibleEnemies.length === 0) {
    return null;
  }

  return (
    <section className="enemy-survivor-panel">
      <h3>对手信息</h3>
      <div className="enemy-survivor-list">
        {visibleEnemies.map((enemy) => (
          <div className={`enemy-survivor-card rarity-${enemy.rarity}`} key={enemy.id}>
            <Avatar character={enemy} label={enemy.name.replace('对手 ', '').replace('敌方', '').replace('Boss ', '').replace('精英 ', '')} />
            <div>
              <strong>{enemy.name}</strong>
              <span>{RARITY_LABELS[enemy.rarity]} · HP {Math.max(0, enemy.hp)}/{enemy.maxHp}</span>
              <div className="enemy-survivor-hp"><span style={{ width: hpPercent(enemy) }} /></div>
              <small>攻击 {enemy.attack} · 速度 {enemy.speed}</small>
              {(enemy.shield > 0 || enemy.poison > 0 || enemy.vulnerable > 0 || enemy.shieldGainReduced || enemy.healingReduced) && (
                <small>
                  {enemy.shield > 0 ? `护盾 ${enemy.shield} ` : ''}
                  {enemy.poison > 0 ? `毒 ${enemy.poison} ` : ''}
                  {enemy.vulnerable > 0 ? '易损 ' : ''}
                  {enemy.shieldGainReduced ? '护盾削弱 ' : ''}
                  {enemy.healingReduced ? '回血削弱 ' : ''}
                </small>
              )}
              {enemy.passive && <small><HighlightText text={`被动：${enemy.passive.description}`} /></small>}
              {enemy.skill && <small><HighlightText text={`技能：${enemy.skill.description}`} /></small>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function EndScreen({ title, body, log, stats, team, enemies = [], onRetryBattle, onRestart }: EndScreenProps) {
  return (
    <div className="flow-screen">
      <div className="screen-heading">
        <p className="eyebrow">本局结束</p>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
      <EnemySurvivorPanel enemies={enemies} />
      {stats && <DamageMeter stats={stats} team={team} title="伤害统计" />}
      {log.length > 0 && <BattleLog entries={log} stats={stats} team={team} extraAction={onRetryBattle ? { label: '重开本场', onClick: onRetryBattle } : undefined} />}
      <div className="action-row">
        <button className="primary-button" onClick={onRestart}>
          再开一局
        </button>
      </div>
    </div>
  );
}
