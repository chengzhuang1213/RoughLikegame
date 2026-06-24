import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CHARACTER_POOL,
  BOND_GROUPS,
  NODE_LABELS,
  RARITY_LABELS,
  ROLE_LABELS,
  SECONDARY_BONDS,
  applyPostNodePassives,
  type BattleStats,
  type BattleState,
  type BattleType,
  type BossTier,
  type BossTemplate,
  type Character,
  type CharacterBattleStats,
  type CharacterTemplate,
  type MapNode,
  buildMap,
  completeMapNode,
  createAlly,
  createDraftCandidates,
  createEnemiesForBattle,
  createShopOffers,
  GROUP_LABELS,
  getActiveBonds,
  getActiveSecondaryBonds,
  getBattleSlots,
  getRandomBossForTier,
  getRewardGold,
  isBattleNode,
  resolveBattleGroup,
} from './game';
import { BOND_LOGO_SRC, DRAFT_IMAGE_BY_ID, MUSIC_SRC, SFX_SRC, type MusicKey, type SfxKey } from './assets';
import { Avatar, MusicToggleButton, UpgradeLevelBadge } from './components/common';
import { MapScreen } from './pages/MapScreen';

type Screen = 'start' | 'draft' | 'map' | 'battle' | 'result' | 'shop' | 'rest' | 'blessing' | 'win' | 'loss';

function getMusicKey(run: RunState): MusicKey {
  if (run.screen === 'battle') {
    return 'battle';
  }
  if (run.screen === 'draft' || run.screen === 'shop') {
    return 'draftShop';
  }
  if (run.screen === 'rest' || run.screen === 'blessing') {
    return 'rest';
  }
  if (run.screen === 'map') {
    return 'map';
  }
  return 'home';
}

interface ResultState {
  title: string;
  body: string;
  rewardGold: number;
}

interface RunState {
  screen: Screen;
  candidates: CharacterTemplate[];
  draftSelection: string[];
  team: Character[];
  gold: number;
  map: MapNode[];
  currentNodeId: string | null;
  battle: BattleState | null;
  boss: BossTemplate;
  result: ResultState | null;
  runStats: BattleStats;
  statsOpen: boolean;
  battleStatsOpen: boolean;
  eventLog: string[];
  shopOffers: CharacterTemplate[];
  restHealUsed: boolean;
  restReviveUsed: boolean;
  pendingEnhance: { source: 'elite' | 'boss'; cost: number; free: boolean } | null;
  enhanceReady: boolean;
  pendingBossVictory: boolean;
  bossRetrySnapshot: { team: Character[]; battle: BattleState } | null;
}

type HealType = 'small' | 'large';

const HEAL_OPTIONS: Record<HealType, { label: string; cost: number; amount: number; full?: boolean }> = {
  small: { label: '小治疗', cost: 20, amount: 15 },
  large: { label: '大治疗', cost: 50, amount: 50 },
};
const REVIVE_COST = 40;
const REVIVE_HP_RATIO = 0.3;
const ENHANCE_COST = 20;

function applyLayerBlessing(team: Character[]): Character[] {
  return team.map((member) => {
    const blessedHp = Math.ceil(member.maxHp * 0.5);
    if (member.injured || member.hp <= 0) {
      return { ...member, injured: false, hp: blessedHp };
    }

    if (member.hp < blessedHp) {
      return { ...member, hp: blessedHp };
    }

    return member;
  });
}

function createRun(): RunState {
  const boss = getRandomBossForTier(1);

  return {
    screen: 'start',
    candidates: createDraftCandidates(),
    draftSelection: [],
    team: [],
    gold: 80,
    map: buildMap(),
    currentNodeId: null,
    battle: null,
    boss,
    result: null,
    runStats: {},
    statsOpen: false,
    battleStatsOpen: false,
    eventLog: [],
    shopOffers: [],
    restHealUsed: false,
    restReviveUsed: false,
    pendingEnhance: null,
    enhanceReady: false,
    pendingBossVictory: false,
    bossRetrySnapshot: null,
  };
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function mergeBattleStats(current: BattleStats, battleStats: BattleStats): BattleStats {
  const merged: BattleStats = Object.fromEntries(
    Object.entries(current).map(([id, stat]) => [id, { ...stat }]),
  );

  Object.entries(battleStats).forEach(([id, stat]) => {
    const target = merged[id] ?? {
      characterId: stat.characterId,
      name: stat.name,
      damageDealt: 0,
      damageTaken: 0,
      shieldBlocked: 0,
      criticalHits: 0,
    };
    target.name = stat.name;
    target.damageDealt += stat.damageDealt;
    target.damageTaken += stat.damageTaken;
    target.shieldBlocked += stat.shieldBlocked ?? 0;
    target.criticalHits += stat.criticalHits;
    merged[id] = target;
  });

  return merged;
}

function getOrderedStats(team: Character[], stats: BattleStats): CharacterBattleStats[] {
  return team
    .map((member) => ({
      characterId: member.id,
      name: member.name,
      damageDealt: stats[member.id]?.damageDealt ?? 0,
      damageTaken: stats[member.id]?.damageTaken ?? 0,
      shieldBlocked: stats[member.id]?.shieldBlocked ?? 0,
      criticalHits: stats[member.id]?.criticalHits ?? 0,
    }))
    .sort((left, right) => right.damageDealt - left.damageDealt);
}

function draftImageSrc(character: CharacterTemplate | Character) {
  const templateId = 'templateId' in character ? character.templateId : character.id;
  return DRAFT_IMAGE_BY_ID[templateId] ?? character.avatar;
}

function getSecondaryBondsForTemplate(templateId: string) {
  return SECONDARY_BONDS.filter((bond) => bond.memberIds.includes(templateId));
}

function groupDetail(groupId: CharacterTemplate['group']) {
  const group = BOND_GROUPS.find((bond) => bond.id === groupId);
  if (!group) {
    return `${GROUP_LABELS[groupId]}：主羁绊。`;
  }
  return `${group.name}。2人：${group.level2Description} 3人：${group.level3Description}`;
}

function rarityDetail(rarity: CharacterTemplate['rarity']) {
  const details: Record<CharacterTemplate['rarity'], string> = {
    legendary: '传奇偶像：稀有度最高，基础数值和技能强度通常更高。',
    star: '明星偶像：核心战力，通常拥有更强的成长空间。',
    normal: '普通偶像：容易成型，适合补齐羁绊和队伍空位。',
    enemy: '小怪：普通敌人，击败后获得少量金币。',
    elite: '精英：高威胁敌人，击败后可获得强化机会。',
    boss: 'Boss：层末首领，击败后推进到下一层。',
  };
  return details[rarity];
}

function roleDetail(role: CharacterTemplate['role']) {
  if (!role) {
    return '';
  }

  const details: Record<NonNullable<CharacterTemplate['role']>, string> = {
    tank: '坦克：承受标准伤害，通常生命值更高，适合前排承压。',
    fighter: '战士：受到伤害降低到90%，兼顾输出和生存。',
    assassin: '刺客：受到伤害降低到70%，更适合高风险输出。',
    support: '辅助：受到伤害提高到120%，更依赖保护和站位。',
  };
  return details[role];
}

function InfoPill({ className, label, tooltip }: { className: string; label: string; tooltip: string }) {
  return (
    <span className={`${className} info-pill`.trim()} data-tooltip={tooltip} tabIndex={0}>
      {label}
    </span>
  );
}

function getBondGroupForTemplate(template: CharacterTemplate) {
  return BOND_GROUPS.find((group) => group.id === template.group) ?? null;
}

function getTemplateById(id: string) {
  return CHARACTER_POOL.find((character) => character.id === id) ?? null;
}

function maxUpgradeLevel(rarity: Character['rarity'] | CharacterTemplate['rarity']) {
  if (rarity === 'normal') {
    return 3;
  }
  if (rarity === 'star') {
    return 4;
  }
  if (rarity === 'legendary') {
    return 5;
  }
  return 1;
}

function getUpgradeEffectLines(templateId: string, level: number): string[] {
  switch (templateId) {
    case 'ayumu':
      return level >= 4 ? ['技能：温柔守护无CD，全体恢复15生命。', '被动：每次释放技能后，后续治疗量+3。'] : level >= 3 ? ['技能CD1：全体恢复15生命。', '被动：每次释放技能后，后续治疗量+3。'] : level >= 2 ? ['技能CD1：全体恢复10生命。', '被动：每次释放技能后，后续治疗量+3。'] : ['技能CD1：治疗一个单位10生命。', '被动：每次释放技能后，后续治疗量+3。'];
    case 'rina':
      return level >= 3
        ? ['被动：攻击时有75%概率追加一次攻击。', '战斗开始时获得10点护盾。']
        : level >= 2
          ? ['被动：攻击时有50%概率追加一次攻击。', '战斗开始时获得10点护盾。']
          : ['被动：攻击时有50%概率追加一次攻击。'];
    case 'nico':
      return level >= 5 ? ['被动：每次使用技能时，攻击力永久提高4点。', '技能：连续攻击4次，不损失生命，可连续释放但生命值必须高于20%，基础攻击力+1。'] : level >= 4 ? ['被动：每次使用技能时，攻击力永久提高4点。', '技能：连续攻击3次，不损失生命，可连续释放但生命值必须高于20%，基础攻击力+1。'] : level >= 3 ? ['被动：每次使用技能时，攻击力永久提高4点。', '技能：连续攻击3次，不再损失生命值，基础攻击力+1。'] : level >= 2 ? ['被动：每次使用技能时，攻击力永久提高4点。', '技能：失去当前生命值10%，连续攻击2次。'] : ['被动：每次使用技能时，攻击力永久提高3点。', '技能CD1：失去当前生命值10%，连续攻击2次。'];
    case 'kotori':
      return level >= 4 ? ['被动：敌方获得护盾效果降低50%；攻击前摧毁目标所有护盾。', '技能：50%暴击，暴击造成2倍伤害；攻击额外附加10点真实伤害。'] : level >= 3 ? ['被动：敌方获得护盾效果降低50%；攻击前摧毁目标所有护盾。', '技能：50%暴击，暴击造成2倍伤害。'] : level >= 2 ? ['被动：敌方获得护盾效果降低50%。', '技能：50%暴击，暴击造成2倍伤害。'] : ['被动：敌方获得护盾效果降低50%。', '技能：30%暴击，暴击造成2倍伤害。'];
    case 'keke':
      return level >= 5 ? ['被动：每次攻击恢复造成伤害15%的生命值。', '超级变身：攻击力+5，速度+1，仅一次。', '可可重击：10%造成5倍伤害，90%造成3.3倍伤害。'] : level >= 4 ? ['被动：每次攻击恢复造成伤害15%的生命值。', '超级变身：攻击力+3，速度+1，仅一次。', '可可重击：10%造成4倍伤害，90%造成2.5倍伤害。'] : level >= 3 ? ['被动：每次攻击恢复造成伤害15%的生命值。', '超级变身：攻击力+3，速度+1，仅一次。', '可可重击：10%造成3倍伤害，90%造成1.75倍伤害。'] : level >= 2 ? ['被动：每次攻击恢复造成伤害15%的生命值。', '超级变身：攻击力+1，速度+1，仅一次。', '解锁可可重击：10%造成3倍伤害，90%造成1.75倍伤害。'] : ['被动：每次攻击恢复造成伤害15%的生命值。', '超级变身：全场仅一次，攻击力+1，速度+1，本回合不进行其他行动。'];
    case 'you':
      return level >= 3
        ? ['被动：攻击后施加易损，使下一次单体攻击造成2.5倍伤害。']
        : level >= 2
          ? ['被动：攻击后施加易损，使下一次单体攻击造成2倍伤害。']
          : ['被动：攻击后施加易损，使下一次单体攻击造成1.5倍伤害。'];
    case 'eli':
      return level >= 4 ? ['被动：敌方回血效果降低50%；绘里保证成为玩家方第一个行动单位。', '技能CD1：全体友方攻击力+4，并指定一名友方立即普通攻击。'] : level >= 3 ? ['被动：敌方回血效果降低50%；绘里保证成为玩家方第一个行动单位。', '技能CD1：全体友方攻击力+4，随后绘里普通攻击。'] : level >= 2 ? ['被动：敌方回血效果降低50%；绘里保证成为玩家方第一个行动单位。', '技能CD1：全体友方攻击力+2，随后绘里普通攻击。'] : ['被动：敌方回血效果降低50%。', '技能CD1：全体友方攻击力+2，随后绘里普通攻击。'];
    case 'mari':
      return level >= 5 ? ['核心资源：战意。每次攻击和释放技能获得1层战意，最多4层。', '每层战意每回合提供2护盾和1攻击力。', '4级战意下「理事长的完美谢幕」追加队友攻击力总和65%的伤害。'] : level >= 3 ? ['核心资源：战意。每次攻击和释放技能获得1层战意，最多3层。', '每层战意每回合提供2护盾和1攻击力。'] : level >= 2 ? ['核心资源：战意。开场获得2层战意，最多3层。', '每层战意每回合提供0.5护盾和0.5攻击力。'] : ['核心资源：战意。每次攻击和释放技能获得1层战意，最多3层。', '理事长的完美谢幕：进行一次攻击；若拥有护盾，必定暴击并造成1.5倍伤害。'];
    case 'ren':
      return level >= 3
        ? ['被动：生命值额外+50，攻击力+5。', '无主动技能。']
        : level >= 2
          ? ['被动：生命值额外+50。', '无主动技能。']
          : ['被动：生命值额外+30。', '无主动技能。'];
    case 'yoshiko':
      return level >= 3
        ? ['被动：每回合开始时获得5点护盾。', '技能CD1：为一名非自己的友方提供8点护盾。']
        : level >= 2
          ? ['被动：每回合开始时获得3点护盾。', '技能CD1：为一名非自己的友方提供8点护盾。']
          : ['被动：每回合开始时获得3点护盾。', '技能CD1：为一名非自己的友方提供5点护盾。'];
    case 'nozomi':
      return level >= 4
        ? ['技能CD1：随机抽取塔罗牌。', '倒吊人：本次技能伤害×2.5。', '命运之轮：造成1.25倍伤害并获得12护盾。', '魔术师：造成1倍伤害并立即再次抽牌；触发后下回合仍可使用技能；每回合最多抽到1次魔术师。']
        : level >= 3
          ? ['技能CD1：随机抽取塔罗牌。', '倒吊人：本次技能伤害×2.5。', '命运之轮：造成1.25倍伤害并获得12护盾。', '魔术师：造成1倍伤害并立即再次抽牌；每回合最多抽到1次魔术师。']
          : level >= 2
            ? ['技能CD1：随机抽取塔罗牌。', '倒吊人：本次技能伤害×2.5。', '命运之轮：造成1.1倍伤害并获得8护盾。', '魔术师：造成1倍伤害并立即再次抽牌；每回合最多抽到1次魔术师。']
            : ['技能CD1：随机抽取塔罗牌。', '倒吊人：本次技能伤害×1.75。', '命运之轮：造成1.1倍伤害并获得8护盾。', '魔术师：造成1倍伤害并立即再次抽牌；每回合最多抽到1次魔术师。'];
    case 'kanata':
      return level >= 5 ? ['被动：每回合给敌人施加1层梦境，最多2层；每层使彼方伤害+8%。', '技能：造成攻击力100%伤害；50%追加目标当前生命20%，否则追加10%；结算后目标低于25%立即斩杀。'] : level >= 4 ? ['被动：每回合给敌人施加1层梦境，最多2层；每层使彼方伤害+8%。', '技能：造成攻击力100%伤害；20%追加目标当前生命20%，否则追加10%；结算后目标低于20%立即斩杀。'] : level >= 3 ? ['被动：每回合给敌人施加1层梦境，最多2层；每层使彼方伤害+5%。', '技能：造成攻击力100%伤害；20%追加目标当前生命20%，否则追加10%；结算后目标低于20%立即斩杀。'] : level >= 2 ? ['被动：每回合给敌人施加1层梦境，最多2层；每层使彼方伤害+5%。', '技能：造成攻击力100%伤害；20%追加目标当前生命20%，否则追加10%。'] : ['被动：每回合给敌人施加1层梦境，最多2层；每层使彼方伤害+3%。', '技能：造成攻击力100%伤害；20%追加目标当前生命20%，否则追加10%。'];
    default:
      return [];
  }
}

function getUpgradeChangeLines(templateId: string, level: number): string[] {
  const changes: Record<string, Record<number, string[]>> = {
    ayumu: {
      2: ['治疗从单体改为全体。'],
      3: ['治疗量 10 -> 15。'],
      4: ['移除技能CD。'],
    },
    rina: {
      2: ['战斗开始时获得10点护盾。'],
      3: ['追加攻击概率 50% -> 75%。'],
    },
    nico: {
      2: ['被动攻击力成长 +3 -> +4。'],
      3: ['连续攻击 2次 -> 3次，不再损失生命，基础攻击力+1。'],
      4: ['技能可连续释放，条件为生命值高于20%。'],
      5: ['连续攻击 3次 -> 4次。'],
    },
    kotori: {
      2: ['暴击率 30% -> 50%。'],
      3: ['攻击时先摧毁目标所有护盾，再计算伤害。'],
      4: ['攻击额外附加10点真实伤害。'],
    },
    keke: {
      2: ['解锁可可重击：10%造成3倍伤害，90%造成1.75倍伤害。'],
      3: ['超级变身攻击力 +1 -> +3。'],
      4: ['可可重击提高为10%造成4倍，90%造成2.5倍。'],
      5: ['超级变身攻击力 +3 -> +5；可可重击提高为10%造成5倍，90%造成3.3倍。'],
    },
    you: {
      2: ['易损伤害 1.5倍 -> 2倍。'],
      3: ['易损伤害 2倍 -> 2.5倍。'],
    },
    eli: {
      2: ['保证绘里成为玩家方第一个行动单位。'],
      3: ['全体友方攻击力 +2 -> +4。'],
      4: ['绘里不再普通攻击，改为指定一名友方立即普通攻击。'],
    },
    mari: {
      2: ['开场获得2层战意；每层护盾为0.5。'],
      3: ['每层战意每回合提供 0.5护盾/0.5攻击 -> 2护盾/1攻击。'],
      4: ['维持战意体系成长。'],
      5: ['解锁4级战意；4级战意下技能追加队友攻击力总和65%的伤害。'],
    },
    ren: {
      2: ['额外生命 +30 -> +50。'],
      3: ['攻击力 +5。'],
    },
    yoshiko: {
      2: ['堕天守护提供的护盾 5 -> 8。'],
      3: ['每回合开始时获得的护盾 3 -> 5。'],
    },
    nozomi: {
      2: ['倒吊人伤害 1.75倍 -> 2.5倍。'],
      3: ['命运之轮伤害 1.1倍 -> 1.25倍，护盾 8 -> 12。'],
      4: ['魔术师触发后，下回合仍可使用技能。'],
    },
    kanata: {
      2: ['每层梦境伤害 +3% -> +5%。'],
      3: ['技能新增：结算后目标低于20%立即斩杀。'],
      4: ['每层梦境伤害 +5% -> +8%。'],
      5: ['追加当前生命20%的概率 20% -> 50%；斩杀线 20% -> 25%。'],
    },
  };

  return changes[templateId]?.[level] ?? getUpgradeEffectLines(templateId, level);
}

function getEnhancementChangeLines(templateId: string, level: number): string[] {
  const lines = getUpgradeChangeLines(templateId, level).filter((line) => !line.includes('维持'));
  return lines.length > 0 ? lines : ['仅提升等级。'];
}

function HighlightText({ text }: { text: string }) {
  const pattern = /(LV\d+|CD\d+|[+-]?\d+(?:\.\d+)?倍|[+-]?\d+(?:\.\d+)?%|[+-]?\d+(?:\.\d+)?)/g;
  const exactPattern = /^(LV\d+|CD\d+|[+-]?\d+(?:\.\d+)?倍|[+-]?\d+(?:\.\d+)?%|[+-]?\d+(?:\.\d+)?)$/;
  return (
    <>
      {text.split(pattern).map((part, index) =>
        exactPattern.test(part) ? <span className="value-highlight" key={`${part}-${index}`}>{part}</span> : part,
      )}
    </>
  );
}

function HighlightChangedValues({ text, baseText }: { text: string; baseText: string }) {
  const pattern = /(LV\d+|CD\d+|[+-]?\d+(?:\.\d+)?倍|[+-]?\d+(?:\.\d+)?%|[+-]?\d+(?:\.\d+)?)/g;
  const exactPattern = /^(LV\d+|CD\d+|[+-]?\d+(?:\.\d+)?倍|[+-]?\d+(?:\.\d+)?%|[+-]?\d+(?:\.\d+)?)$/;
  const baseValueCounts = new Map<string, number>();

  for (const value of baseText.match(pattern) ?? []) {
    baseValueCounts.set(value, (baseValueCounts.get(value) ?? 0) + 1);
  }

  return (
    <>
      {text.split(pattern).map((part, index) => {
        if (!exactPattern.test(part)) {
          return part;
        }

        const remainingBaseCount = baseValueCounts.get(part) ?? 0;
        if (remainingBaseCount > 0) {
          baseValueCounts.set(part, remainingBaseCount - 1);
          return part;
        }

        return <span className="value-highlight" key={`${part}-${index}`}>{part}</span>;
      })}
    </>
  );
}

function UpgradePreview({ template }: { template: CharacterTemplate }) {
  if (template.rarity === 'enemy' || template.rarity === 'elite' || template.rarity === 'boss') {
    return null;
  }

  const maxLevel = maxUpgradeLevel(template.rarity);
  const levels = Array.from({ length: Math.max(0, maxLevel - 1) }, (_, index) => index + 2);

  return (
    <div className="upgrade-preview">
      <span>升级预览</span>
      {levels.map((level) => (
        <div className="upgrade-preview-row" key={level}>
          <b>LV{level}</b>
          <p><HighlightText text={getUpgradeChangeLines(template.id, level).join(' ')} /></p>
        </div>
      ))}
    </div>
  );
}

function getCompactAbilityDescription(description: string) {
  const upgradeStarts = [
    description.search(/(?:^|[。；;]\s*)(?:LV|Lv|lv)\d/),
    description.search(/(?:^|[。；;]\s*)高等级/),
  ].filter((index) => index >= 0);

  if (upgradeStarts.length === 0) {
    return description;
  }

  return description
    .slice(0, Math.min(...upgradeStarts))
    .trim()
    .replace(/[，,；;：:、\s]+$/, '')
    .replace(/[。.!！?？]+$/, '');
}

function App() {
  const [run, setRun] = useState<RunState>(() => createRun());
  const [musicMuted, setMusicMuted] = useState(false);
  const [shopSelectedOffer, setShopSelectedOffer] = useState<CharacterTemplate | null>(null);

  const currentNode = useMemo(
    () => run.map.find((node) => node.id === run.currentNodeId) ?? null,
    [run.currentNodeId, run.map],
  );

  const aliveTeam = run.team.filter((member) => !member.injured && member.hp > 0);
  const shopPreviewTeam = useMemo(() => {
    if (run.screen !== 'shop' || !shopSelectedOffer) {
      return run.team;
    }
    return [...run.team, createAlly(shopSelectedOffer)];
  }, [run.screen, run.team, shopSelectedOffer]);
  const audioRefs = useRef<Partial<Record<MusicKey | SfxKey, HTMLAudioElement>>>({});
  const audioUnlockedRef = useRef(false);
  const currentMusicRef = useRef<MusicKey | null>(null);
  const lastVictoryNodeRef = useRef<string | null>(null);

  function getAudio(key: MusicKey | SfxKey, src: string) {
    const existing = audioRefs.current[key];
    if (existing) {
      return existing;
    }

    const audio = new Audio(src);
    audio.preload = 'auto';
    audioRefs.current[key] = audio;
    return audio;
  }

  function playMusic(key: MusicKey) {
    if (musicMuted) {
      (Object.keys(MUSIC_SRC) as MusicKey[]).forEach((musicKey) => {
        getAudio(musicKey, MUSIC_SRC[musicKey]).pause();
      });
      return;
    }

    if (!audioUnlockedRef.current) {
      return;
    }

    (Object.keys(MUSIC_SRC) as MusicKey[]).forEach((musicKey) => {
      const audio = getAudio(musicKey, MUSIC_SRC[musicKey]);
      if (musicKey !== key) {
        audio.pause();
        audio.currentTime = 0;
      }
    });

    const audio = getAudio(key, MUSIC_SRC[key]);
    audio.loop = true;
    audio.volume = key === 'battle' ? 0.38 : 0.42;
    if (currentMusicRef.current !== key) {
      audio.currentTime = 0;
      currentMusicRef.current = key;
    }
    void audio.play().catch(() => undefined);
  }

  function playSfx(key: SfxKey) {
    if (musicMuted || !audioUnlockedRef.current) {
      return;
    }

    const audio = getAudio(key, SFX_SRC[key]);
    audio.loop = false;
    audio.volume = 0.74;
    audio.pause();
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }

  function unlockAudio() {
    if (audioUnlockedRef.current) {
      return;
    }

    audioUnlockedRef.current = true;
    playMusic(getMusicKey(run));
  }

  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  });

  useEffect(() => {
    playMusic(getMusicKey(run));
  }, [run.screen, run.battle?.type, musicMuted]);

  useEffect(() => {
    if (run.screen !== 'shop') {
      setShopSelectedOffer(null);
      return;
    }

    if (shopSelectedOffer && !run.shopOffers.some((offer) => offer.id === shopSelectedOffer.id)) {
      setShopSelectedOffer(null);
    }
  }, [run.screen, run.shopOffers, shopSelectedOffer]);

  function toggleMusic() {
    unlockAudio();
    setMusicMuted((muted) => !muted);
  }

  useEffect(() => {
    if (run.screen === 'battle' && run.battle?.phase === 'won') {
      if (lastVictoryNodeRef.current !== run.battle.nodeId) {
        lastVictoryNodeRef.current = run.battle.nodeId;
        playSfx('battleVictory');
      }
      return;
    }

    if (run.battle?.phase !== 'won') {
      lastVictoryNodeRef.current = null;
    }
  }, [run.screen, run.battle?.phase, run.battle?.nodeId]);


  function resetRun() {
    setRun(createRun());
  }

  function startGame() {
    playSfx('next');
    setRun({
      ...createRun(),
      screen: 'draft',
      candidates: createDraftCandidates(),
      draftSelection: [],
    });
  }

  function rerollDraft() {
    setRun((previous) => ({
      ...previous,
      candidates: createDraftCandidates(),
      draftSelection: [],
    }));
  }

  function toggleDraft(id: string) {
    setRun((previous) => {
      const hasSelected = previous.draftSelection.includes(id);
      const draftSelection = hasSelected
        ? previous.draftSelection.filter((selectedId) => selectedId !== id)
        : previous.draftSelection.length < 2
          ? [...previous.draftSelection, id]
          : previous.draftSelection;

      return { ...previous, draftSelection };
    });
  }

  function confirmDraft() {
    if (run.draftSelection.length === 2) {
      playSfx('next');
    }

    setRun((previous) => {
      if (previous.draftSelection.length !== 2) {
        return previous;
      }

      const team = previous.draftSelection
        .map((id) => CHARACTER_POOL.find((character) => character.id === id))
        .filter((character): character is CharacterTemplate => Boolean(character))
        .map(createAlly);

      return { ...previous, team, screen: 'map', eventLog: ['巡演开始。'] };
    });
  }

  function enterNode(node: MapNode) {
    if (!node.available || node.completed) {
      return;
    }

    playSfx('mapSelect');

    setRun((previous) => {
      if (!node.available || node.completed) {
        return previous;
      }

      if (isBattleNode(node.type)) {
        const aliveCount = previous.team.filter((member) => !member.injured && member.hp > 0).length;
        if (aliveCount === 0) {
          return { ...previous, screen: 'loss' };
        }

        const battleType: BattleType = node.type;
        const slots = getBattleSlots(battleType, aliveCount);
        const enemies = createEnemiesForBattle(battleType, previous.boss);
        const battle: BattleState = {
          nodeId: node.id,
          type: battleType,
          enemies,
          activeEnemyIndex: 0,
          selectedIds: [],
          slots,
          phase: 'select',
          rewardGold: getRewardGold(battleType, enemies),
          log: [`遭遇${NODE_LABELS[battleType]}。先确认敌人，再选择${slots}名出战伙伴。`],
          runtime: {},
          stats: {},
        };

        return {
          ...previous,
          screen: 'battle',
          currentNodeId: node.id,
          battle,
          result: null,
          restHealUsed: false,
          restReviveUsed: false,
          bossRetrySnapshot: battleType === 'boss' ? { team: previous.team.map((member) => ({ ...member })), battle: { ...battle, enemies: battle.enemies.map((enemy) => ({ ...enemy })) } } : null,
          eventLog: [...previous.eventLog, `进入${NODE_LABELS[node.type]}节点。`],
        };
      }

      if (node.type === 'shop') {
        const ownedIds = new Set(previous.team.map((member) => member.templateId));
        const shopOffers = createShopOffers(previous.boss.bossTier, ownedIds);

        return {
          ...previous,
          screen: 'shop',
          currentNodeId: node.id,
          shopOffers,
          result: null,
          restHealUsed: false,
          restReviveUsed: false,
          eventLog: [...previous.eventLog, `进入${NODE_LABELS[node.type]}节点。`],
        };
      }

      return {
        ...previous,
        screen: 'rest',
        currentNodeId: node.id,
        result: null,
        restHealUsed: false,
        restReviveUsed: false,
        eventLog: [...previous.eventLog, `进入${NODE_LABELS[node.type]}节点。`],
      };
    });
  }

  function advanceAfterCurrentNode(previous: RunState, teamInput = previous.team): RunState {
    if (!previous.currentNodeId) {
      return { ...previous, screen: 'map', pendingEnhance: null, enhanceReady: false, pendingBossVictory: false };
    }

    const team = applyPostNodePassives(teamInput);
    const clearedNodeMap = completeMapNode(previous.map, previous.currentNodeId);
    const completedNode = previous.map.find((node) => node.id === previous.currentNodeId);
    const completionLog = [
      ...(completedNode ? [`完成${NODE_LABELS[completedNode.type]}节点。`] : []),
      ...(previous.battle?.log ?? []),
    ];
    const shouldAdvanceLayer =
      previous.battle?.type === 'boss' &&
      previous.battle.phase === 'won' &&
      previous.boss.bossTier < 3;

    if (shouldAdvanceLayer) {
      const nextTier = (previous.boss.bossTier + 1) as BossTier;
      return {
        ...previous,
        screen: 'blessing',
        team: applyLayerBlessing(team),
        map: buildMap(),
        currentNodeId: null,
        battle: null,
        boss: getRandomBossForTier(nextTier),
        result: null,
        shopOffers: [],
        restHealUsed: false,
        restReviveUsed: false,
        pendingEnhance: null,
        enhanceReady: false,
        pendingBossVictory: false,
        bossRetrySnapshot: null,
        eventLog: [...previous.eventLog, ...completionLog, `进入第${nextTier}层。`],
      };
    }

    return {
      ...previous,
      screen: 'map',
      team,
      map: clearedNodeMap,
      currentNodeId: null,
      battle: null,
      result: null,
      shopOffers: [],
      restHealUsed: false,
      restReviveUsed: false,
      pendingEnhance: null,
      enhanceReady: false,
      pendingBossVictory: false,
      bossRetrySnapshot: null,
      eventLog: [...previous.eventLog, ...completionLog],
    };
  }
  function finishCurrentNode() {
    setRun((previous) => advanceAfterCurrentNode(previous));
  }

  function closeBattleStatsModal() {
    setRun((previous) => ({
      ...previous,
      battleStatsOpen: false,
      enhanceReady: Boolean(previous.pendingEnhance && previous.battle?.phase === 'won'),
    }));
  }

  function retryBossBattle() {
    setRun((previous) => {
      if (!previous.bossRetrySnapshot || previous.battle?.type !== 'boss' || previous.battle.phase !== 'lost') {
        return previous;
      }

      const snapshot = previous.bossRetrySnapshot;
      return {
        ...previous,
        screen: 'battle',
        team: snapshot.team.map((member) => ({ ...member })),
        battle: {
          ...snapshot.battle,
          enemies: snapshot.battle.enemies.map((enemy) => ({ ...enemy })),
          selectedIds: [],
          phase: 'select',
          runtime: {},
          stats: {},
        },
        result: null,
        battleStatsOpen: false,
        pendingEnhance: null,
        enhanceReady: false,
        pendingBossVictory: false,
        eventLog: [...previous.eventLog, '重开Boss战。'],
      };
    });
  }

  function continueFromBlessing() {
    setRun((previous) => ({
      ...previous,
      screen: 'map',
    }));
  }

  function toggleBattleSelection(id: string) {
    setRun((previous) => {
      if (
        !previous.battle ||
        (previous.battle.phase !== 'select' && previous.battle.phase !== 'relay')
      ) {
        return previous;
      }

      const alreadySelected = previous.battle.selectedIds.includes(id);
      const selectedIds = alreadySelected
        ? previous.battle.selectedIds.filter((selectedId) => selectedId !== id)
        : previous.battle.selectedIds.length < previous.battle.slots
          ? [...previous.battle.selectedIds, id]
          : [...previous.battle.selectedIds.slice(0, -1), id];

      return {
        ...previous,
        battle: { ...previous.battle, selectedIds },
      };
    });
  }

  function startBattle() {
    setRun((previous) => {
      if (
        !previous.battle ||
        (previous.battle.phase !== 'select' && previous.battle.phase !== 'relay') ||
        previous.battle.selectedIds.length !== previous.battle.slots
      ) {
        return previous;
      }

      const { team, battle } = resolveBattleGroup(
        previous.team,
        previous.battle,
        previous.battle.selectedIds,
      );

      if (battle.phase === 'won') {
        const runStats = mergeBattleStats(previous.runStats, battle.stats);
        const isBossBattle = battle.type === 'boss';
        const isFinalBoss = isBossBattle && previous.boss.bossTier === 3;
        const canEnhance = battle.type === 'elite' || (isBossBattle && !isFinalBoss);
        const result: ResultState = {
          title: isBossBattle ? `第${previous.boss.bossTier}层 Boss胜利` : `${NODE_LABELS[battle.type]}胜利`,
          body: isBossBattle
            ? isFinalBoss
              ? '最终Boss被击败，三层巡演路线完成。'
              : `第${previous.boss.bossTier}层Boss被击败，即将进入第${previous.boss.bossTier + 1}层。`
            : '保留当前生命值，继续规划下一段路线。',
          rewardGold: battle.rewardGold,
        };

        return {
          ...previous,
          team,
          gold: previous.gold + battle.rewardGold,
          battle,
          result,
          runStats,
          battleStatsOpen: true,
          screen: isFinalBoss ? 'win' : 'battle',
          pendingEnhance: canEnhance
            ? { source: battle.type === 'boss' ? 'boss' : 'elite', cost: battle.type === 'boss' ? 0 : ENHANCE_COST, free: battle.type === 'boss' }
            : null,
          enhanceReady: false,
        };
      }

      if (battle.phase === 'lost') {
        return {
          ...previous,
          team,
          battle,
          battleStatsOpen: true,
          enhanceReady: false,
          screen: 'loss',
        };
      }

      return {
        ...previous,
        team,
        battle,
        screen: 'battle',
      };
    });
  }

  function completeEnhancement(id: string | null) {
    setRun((previous) => {
      if (!previous.pendingEnhance) {
        return previous;
      }

      const source = previous.pendingEnhance.source;
      let nextGold = previous.gold;
      let nextTeam = previous.team;

      if (id) {
        const target = previous.team.find((member) => member.id === id);
        const cost = previous.pendingEnhance.cost;
        if (!target || (target.upgradeLevel ?? 1) >= maxUpgradeLevel(target.rarity) || (!previous.pendingEnhance.free && previous.gold < cost)) {
          return previous;
        }

        nextGold = previous.pendingEnhance.free ? previous.gold : previous.gold - cost;
        nextTeam = previous.team.map((member) => {
          if (member.id !== id) {
            return member;
          }

          const currentLevel = member.upgradeLevel ?? 1;
          const nextLevel = Math.min(maxUpgradeLevel(member.rarity), currentLevel + 1) as Character['upgradeLevel'];
          const renHpBonus = member.templateId === 'ren' && currentLevel === 1 && nextLevel >= 2 ? 20 : 0;
          const renAttackBonus = member.templateId === 'ren' && currentLevel === 2 && nextLevel >= 3 ? 5 : 0;
          return {
            ...member,
            upgradeLevel: nextLevel,
            maxHp: member.maxHp + renHpBonus,
            hp: member.hp + renHpBonus,
            attack: member.attack + renAttackBonus,
          };
        });
      }

      const nextState = { ...previous, gold: nextGold, team: nextTeam, pendingEnhance: null, enhanceReady: false };
      if (source === 'boss') {
        return { ...nextState, screen: 'battle', pendingBossVictory: true };
      }

      return { ...nextState, screen: 'battle' };
    });
  }

  function dismissEnhancement() {
    setRun((previous) => {
      if (!previous.pendingEnhance) {
        return previous;
      }

      const nextState = { ...previous, pendingEnhance: null, enhanceReady: false };
      if (previous.pendingEnhance.source === 'boss') {
        return { ...nextState, screen: 'battle', pendingBossVictory: true };
      }

      return advanceAfterCurrentNode(nextState);
    });
  }

  function dismissBossVictory() {
    setRun((previous) => ({ ...previous, pendingBossVictory: false }));
  }

  function buyCharacter(template: CharacterTemplate) {
    let didBuy = false;

    setRun((previous) => {
      const offerStillAvailable = previous.shopOffers.some((offer) => offer.id === template.id);
      const alreadyOwned = previous.team.some((member) => member.templateId === template.id);
      if (previous.screen !== 'shop' || !offerStillAvailable || alreadyOwned || previous.team.length >= 4 || previous.gold < template.price) {
        return previous;
      }

      didBuy = true;
      return {
        ...previous,
        gold: previous.gold - template.price,
        team: [...previous.team, createAlly(template)],
        shopOffers: previous.shopOffers.filter((offer) => offer.id !== template.id),
      };
    });

    if (didBuy) {
      playSfx('buy');
    }
  }

  function healCharacter(id: string, healType: HealType) {
    setRun((previous) => {
      const heal = HEAL_OPTIONS[healType];
      const healAmount = heal.full ? Number.MAX_SAFE_INTEGER : heal.amount;
      const member = previous.team.find((character) => character.id === id);
      if (
        previous.restHealUsed ||
        !member ||
        member.injured ||
        member.hp >= member.maxHp ||
        previous.gold < heal.cost
      ) {
        return previous;
      }

      return {
        ...previous,
        gold: previous.gold - heal.cost,
        restHealUsed: true,
        team: previous.team.map((character) =>
          character.id === id
            ? { ...character, hp: Math.min(character.maxHp, character.hp + healAmount) }
            : character,
        ),
      };
    });
  }

  function reviveCharacter(id: string) {
    setRun((previous) => {
      const member = previous.team.find((character) => character.id === id);
      if (previous.restReviveUsed || !member || !member.injured || previous.gold < REVIVE_COST) {
        return previous;
      }

      return {
        ...previous,
        gold: previous.gold - REVIVE_COST,
        restReviveUsed: true,
        team: previous.team.map((character) =>
          character.id === id
            ? {
                ...character,
                injured: false,
                hp: Math.max(1, Math.ceil(character.maxHp * REVIVE_HP_RATIO)),
              }
            : character,
        ),
      };
    });
  }

  if (run.screen === 'start') {
    return (
      <div className="app-shell start-shell scene-home">
        <MusicToggleButton muted={musicMuted} onToggle={toggleMusic} className="floating-music-toggle" />
        <StartScreen onStart={startGame} />
      </div>
    );
  }

  if (run.screen === 'draft') {
    return (
      <div className="app-shell draft-shell scene-draft-shop">
        <MusicToggleButton muted={musicMuted} onToggle={toggleMusic} className="floating-music-toggle" />
        <DraftScreen
          candidates={run.candidates}
          selectedIds={run.draftSelection}
          onToggle={toggleDraft}
          onReroll={rerollDraft}
          onConfirm={confirmDraft}
        />
      </div>
    );
  }

  const sceneClass = run.screen === 'battle' && run.battle
    ? `scene-battle-${run.battle.type}`
    : run.screen === 'shop'
      ? 'scene-draft-shop'
      : run.screen === 'map'
        ? 'scene-map'
        : run.screen === 'rest' || run.screen === 'blessing'
          ? 'scene-rest-blessing'
          : 'scene-home';

  return (
    <div className={`app-shell game-shell ${sceneClass} ${run.screen === 'map' ? 'map-hud-shell' : ''} ${run.screen === 'battle' ? 'battle-shell' : ''} ${run.screen === 'shop' ? 'shop-shell' : ''}`}>
      <MusicToggleButton muted={musicMuted} onToggle={toggleMusic} className="floating-music-toggle" />
      {run.screen !== 'shop' && (
        <header className="topbar">
          <div>
            <p className="eyebrow">非商用个人 Beta</p>
            <h1>DreamStage</h1>
          </div>
          <div className="run-stats" aria-label="当前资源">
            <span>金币 {run.gold}</span>
            <span>伙伴 {run.team.length}</span>
            <span>可出战 {aliveTeam.length}</span>
          </div>
        </header>
      )}

      <main className="main-layout">
        <CompactRunSidePanel team={shopPreviewTeam} onRestart={resetRun} />

        <section className="screen-panel">
          {run.screen === 'map' && <MapScreen nodes={run.map} boss={run.boss} team={run.team} stats={run.runStats} gold={run.gold} musicMuted={musicMuted} onToggleMusic={toggleMusic} onEnter={enterNode} onOpenStats={() => setRun((previous) => ({ ...previous, statsOpen: true }))} eventLog={run.eventLog} onRestart={resetRun} />}

          {run.screen === 'battle' && run.battle && (
            <BattleScreen
              battle={run.battle}              boss={run.boss}
              gold={run.gold}
              team={run.team}
              pendingEnhance={run.enhanceReady ? run.pendingEnhance : null}
              pendingBossVictory={run.pendingBossVictory}
              onContinue={finishCurrentNode}
              onToggleSelection={toggleBattleSelection}              onStart={startBattle}
              onEnhance={completeEnhancement}
              onDismissEnhancement={dismissEnhancement}
              onBossBack={dismissBossVictory}
              onBossBlessing={finishCurrentNode}
            />
          )}

          {run.screen === 'result' && run.result && run.battle && (
            <ResultScreen result={run.result} log={run.battle.log} stats={run.battle.stats} team={run.team} onContinue={finishCurrentNode} />
          )}

          {run.screen === 'shop' && (
            <ShopScreen
              gold={run.gold}
              offers={run.shopOffers}
              selectedOffer={shopSelectedOffer}
              onSelectOffer={setShopSelectedOffer}
              onBuy={buyCharacter}
              onLeave={finishCurrentNode}
            />
          )}

          {run.screen === 'rest' && (
            <RestScreen
              gold={run.gold}
              team={run.team}
              healUsed={run.restHealUsed}
              reviveUsed={run.restReviveUsed}
              onHeal={healCharacter}
              onRevive={reviveCharacter}
              onLeave={finishCurrentNode}
            />
          )}

          {run.screen === 'blessing' && (
            <BlessingScreen team={run.team} tier={run.boss.bossTier} onContinue={continueFromBlessing} />
          )}

          {run.screen === 'win' && run.battle && (
            <EndScreen
              title="胜利"
              body="Boss战完成，Beta角色构筑循环已经跑通。"
              log={run.battle.log}
              stats={run.battle.stats}
              team={run.team}
              onRestart={resetRun}
            />
          )}

          {run.screen === 'loss' && (
            <EndScreen
              title="失败"
              body="所有伙伴都进入重伤状态。下一局可以更早休息或招募。"
              log={run.battle?.log ?? []}
              enemies={run.battle?.enemies ?? []}
              stats={run.battle?.stats}
              team={run.team}
              onRetryBattle={run.battle?.type === 'boss' && run.bossRetrySnapshot ? retryBossBattle : undefined}
              onRestart={resetRun}
            />
          )}
        </section>
      </main>

      {run.battleStatsOpen && run.battle && (
        <BattleResultModal
          phase={run.battle.phase}
          stats={run.battle.stats}
          team={run.team}
          primaryLabel={run.pendingEnhance && run.battle.phase === 'won' ? '进入强化' : '返回'}
          onClose={closeBattleStatsModal}
        />
      )}
      {run.statsOpen && (
        <RunStatsModal
          stats={run.runStats}
          team={run.team}
          onClose={() => setRun((previous) => ({ ...previous, statsOpen: false }))}
        />
      )}

      {currentNode && (
        <footer className="context-bar">
          当前层：第 {run.boss.bossTier} 层 · 当前节点：{NODE_LABELS[currentNode.type]} · 路线第 {currentNode.row + 1} 排
        </footer>
      )}
    </div>
  );
}

interface DraftScreenProps {
  candidates: CharacterTemplate[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onReroll: () => void;
  onConfirm: () => void;
}

function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <main className="start-page">
      <div className="start-copy">
        <img className="start-logo" src="/ui/start/dream-stage-logo.png" alt="DreamStage" />
      </div>
      <button className="school-gate-start" type="button" onClick={onStart} aria-label="开始巡演">
        <img src="/ui/start/start-tour-button.png" alt="" />
      </button>
    </main>
  );
}

function BondMemberPopover({ memberIds, ownedIds, summary }: { memberIds: string[]; ownedIds: Set<string>; summary?: string }) {
  return (
    <div className="bond-member-popover">
      {summary && <p>{summary}</p>}
      {memberIds.map((memberId) => {
        const member = getTemplateById(memberId);
        if (!member) {
          return null;
        }

        const owned = ownedIds.has(member.id);
        return (
          <div className={`bond-member ${owned ? 'owned' : 'missing'}`} key={member.id}>
            <Avatar character={member} label={member.name} small />
            <span>{member.name}</span>
          </div>
        );
      })}
    </div>
  );
}

interface BondItemProps {
  name: string;
  count: number;
  total: number;
  details: string[];
  memberIds: string[];
  ownedIds: Set<string>;
  active: boolean;
  secondary?: boolean;
  logoSrc?: string;
}

function BondItem({ name, count, total, details, memberIds, ownedIds, active, secondary = false, logoSrc }: BondItemProps) {
  return (
    <div className={`bond-item ${active ? 'active' : ''} ${secondary && active ? 'secondary-active' : ''}`}>
      <div className="bond-item-heading">
        {logoSrc && <img className="bond-logo" src={logoSrc} alt="" />}
        <div>
          <strong>
            {name} {count}/{total}
          </strong>
        </div>
      </div>
      <div className="bond-item-details">
        {details.map((detail) => (
          <small key={detail}>{detail}</small>
        ))}
      </div>
      <BondMemberPopover memberIds={memberIds} ownedIds={ownedIds} />
    </div>
  );
}
interface BondTagProps {
  className?: string;
  label: string;
  memberIds: string[];
  ownedIds: Set<string>;
  summary?: string;
}

function BondTag({ className = '', label, memberIds, ownedIds, summary }: BondTagProps) {
  return (
    <div className={`group-tag bond-tag ${className}`.trim()}>
      <span>{label}</span>
      <BondMemberPopover memberIds={memberIds} ownedIds={ownedIds} summary={summary} />
    </div>
  );
}

function CompactRunSidePanel({ team, onRestart }: { team: Character[]; onRestart: () => void }) {
  const slots = Array.from({ length: 4 }, (_, index) => team[index] ?? null);
  const ownedIds = new Set(team.map((member) => member.templateId));
  const primaryBonds = getActiveBonds(team).filter((bond) => bond.count > 0);
  const secondaryBonds = getActiveSecondaryBonds(team).filter((bond) => bond.count > 0);
  const visibleBonds = [
    ...primaryBonds.map((bond) => ({
      id: bond.group.id,
      name: bond.group.name,
      count: bond.count,
      total: 3,
      active: bond.level > 0,
      secondary: false,
      logoSrc: BOND_LOGO_SRC[bond.group.id],
      memberIds: bond.group.memberIds,
      details: [
        `2人：${bond.group.level2Description}`,
        `3人：${bond.group.level3Description}`,
      ],
    })),
    ...secondaryBonds.map((bond) => ({
      id: bond.bond.id,
      name: bond.bond.name,
      count: bond.count,
      total: 2,
      active: bond.active,
      secondary: true,
      logoSrc: BOND_LOGO_SRC[bond.bond.id],
      memberIds: bond.bond.memberIds,
      details: [bond.bond.description],
    })),
  ].sort((left, right) => Number(right.active) - Number(left.active) || right.count - left.count || right.total - left.total).slice(0, 6);

  return (
    <aside className="side-panel compact-run-side-panel">
      <section className="hud-card team-dock">
        <div className="hud-card-heading">
          <h3>当前队伍</h3>
          <span>{team.length}/4</span>
        </div>
        <div className="team-dock-grid">
          {slots.map((member, index) =>
            member ? (
              <div className={`team-dock-member rarity-${member.rarity} ${member.injured ? 'injured' : ''}`} key={member.id} tabIndex={0}>
                <Avatar character={member} label={member.name} />
                <span>{member.injured ? '重伤' : `${member.hp}/${member.maxHp}`}</span>
                <div className="dock-popover team-dock-popover">
                  <strong>{member.name}</strong>
                  <small>{RARITY_LABELS[member.rarity]} · {GROUP_LABELS[member.group]}{member.role ? ` · ${ROLE_LABELS[member.role]}` : ''} · LV{member.upgradeLevel ?? 1}</small>
                  <small>HP {member.hp}/{member.maxHp} · 攻 {member.attack} · 速 {member.speed}</small>
                  {getUpgradeEffectLines(member.templateId, member.upgradeLevel ?? 1).map((line) => <span key={line}>{line}</span>)}
                </div>
              </div>
            ) : (
              <div className="team-empty-slot" key={`empty-${index}`}>
                <span>＋</span>
              </div>
            ),
          )}
        </div>
        <button className="hud-wide-button" type="button" onClick={onRestart}>新一局</button>
      </section>
      <section className="hud-card bond-progress-dock">
        <div className="hud-card-heading">
          <h3>羁绊进度</h3>
          <span>i</span>
        </div>
        <div className="bond-progress-list">
          {visibleBonds.map((bond) => (
            <div className={`bond-progress-row ${bond.secondary ? 'secondary' : ''} ${bond.active ? 'active' : 'inactive'}`} key={bond.id} tabIndex={0}>
              <span className="bond-dot"><img src={bond.logoSrc} alt="" /></span>
              <em>{bond.count}/{bond.total}</em>
              <div className="dock-popover bond-dock-popover">
                <strong>{bond.name} {bond.count}/{bond.total}</strong>
                {bond.details.map((detail) => <span key={detail}>{detail}</span>)}
                <div className="dock-member-grid">
                  {bond.memberIds.map((memberId) => {
                    const member = getTemplateById(memberId);
                    if (!member) {
                      return null;
                    }
                    return (
                      <div className={`bond-member ${ownedIds.has(member.id) ? 'owned' : 'missing'}`} key={member.id}>
                        <Avatar character={member} label={member.name} small />
                        <span>{member.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

function BondPanel({ team }: { team: Character[] }) {
  const ownedIds = new Set(team.map((member) => member.templateId));
  const bonds = getActiveBonds(team).filter((bond) => bond.count > 0);
  const secondaryBonds = getActiveSecondaryBonds(team).filter((bond) => bond.count > 0);

  return (
    <div className="bond-panel">
      <h3>羁绊</h3>
      {bonds.length === 0 && secondaryBonds.length === 0 ? (
        <p>暂无羁绊成员。</p>
      ) : (
        <>
          {bonds.length > 0 && (
            <div className="bond-list">
              {bonds.map((bond) => (
                <BondItem
                  active={bond.level > 0}
                  count={bond.count}
                  details={
                    bond.level >= 2
                      ? [
                          `2人：${bond.group.level2Description}`,
                          ...(bond.level >= 3 ? [`3人：${bond.group.level3Description}`] : []),
                        ]
                      : ['再集齐1名成员激活2人羁绊。']
                  }
                  key={bond.group.id}
                  memberIds={bond.group.memberIds}
                  logoSrc={BOND_LOGO_SRC[bond.group.id]}
                  name={bond.group.name}
                  ownedIds={ownedIds}
                  total={3}
                />
              ))}
            </div>
          )}
          {secondaryBonds.length > 0 && (
            <div className="bond-list">
              <p className="bond-subtitle">次羁绊</p>
              {secondaryBonds.map((activeBond) => (
                <BondItem
                  active={activeBond.active}
                  count={activeBond.count}
                  details={activeBond.active ? [activeBond.bond.description] : ['再集齐1名成员激活。']}
                  key={activeBond.bond.id}
                  memberIds={activeBond.bond.memberIds}
                  logoSrc={BOND_LOGO_SRC[activeBond.bond.id]}
                  name={activeBond.bond.name}
                  ownedIds={ownedIds}
                  secondary
                  total={2}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DraftScreen({ candidates, selectedIds, onToggle, onReroll, onConfirm }: DraftScreenProps) {
  const visibleCandidates = candidates.slice(0, 3);
  const selectedCandidates = visibleCandidates.filter((candidate) => selectedIds.includes(candidate.id));

  return (
    <main className="draft-page">
      <div className="draft-toolbar">
        <div className="screen-heading">
          <p className="eyebrow">初始伙伴</p>
          <h2>选择 2 名偶像开局</h2>
          <p>本次候选 {visibleCandidates.length}/3，已选择 {selectedIds.length}/2。</p>
        </div>
        <div className="draft-actions">
          <button className="secondary-button" onClick={onReroll}>
            重抽候选
          </button>
          <button className="primary-button" disabled={selectedIds.length !== 2} onClick={onConfirm}>
            确认开局
          </button>
        </div>
      </div>
      <div className="draft-grid">
        {visibleCandidates.map((candidate) => (
          <DraftCandidateCard
            key={candidate.id}
            template={candidate}
            selected={selectedIds.includes(candidate.id)}
            onClick={() => onToggle(candidate.id)}
          />
        ))}
      </div>
      <DraftBondPreview selectedCharacters={selectedCandidates} />
    </main>
  );
}

function DraftBondPreview({ selectedCharacters }: { selectedCharacters: CharacterTemplate[] }) {
  const ownedIds = new Set(selectedCharacters.map((character) => character.id));
  const bonds = getActiveBonds(selectedCharacters);
  const secondaryBonds = getActiveSecondaryBonds(selectedCharacters);

  return (
    <section className="draft-bonds">
      <div className="draft-bonds-heading">
        <p className="eyebrow">羁绊说明</p>
        <h3>主羁绊与次羁绊</h3>
      </div>
      <div className="draft-bond-grid">
        {bonds.map((bond) => (
          <BondItem
            active={bond.level > 0}
            count={bond.count}
            details={[
              `2人：${bond.group.level2Description}`,
              `3人：${bond.group.level3Description}`,
            ]}
            key={bond.group.id}
            memberIds={bond.group.memberIds}
            logoSrc={BOND_LOGO_SRC[bond.group.id]}
            name={bond.group.name}
            ownedIds={ownedIds}
            total={3}
          />
        ))}
        {secondaryBonds.map((activeBond) => (
          <BondItem
            active={activeBond.active}
            count={activeBond.count}
            details={[activeBond.bond.description]}
            key={activeBond.bond.id}
            memberIds={activeBond.bond.memberIds}
            logoSrc={BOND_LOGO_SRC[activeBond.bond.id]}
            name={activeBond.bond.name}
            ownedIds={ownedIds}
            secondary
            total={2}
          />
        ))}
      </div>
    </section>
  );
}

interface DraftCandidateCardProps {
  template: CharacterTemplate;
  selected: boolean;
  onClick: () => void;
}

function DraftCandidateCard({ template, selected, onClick }: DraftCandidateCardProps) {
  const primaryBond = getBondGroupForTemplate(template);
  const secondaryBonds = getSecondaryBondsForTemplate(template.id);
  const tagOwnedIds = new Set([template.id]);

  return (
    <button
      className={`draft-card rarity-${template.rarity} ${selected ? 'selected' : ''}`}
      onClick={onClick}
      type="button"
    >
      <div className="draft-portrait">
        <img
          alt=""
          src={draftImageSrc(template)}
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      </div>
      <div className="draft-card-body">
        <div className="card-tags">
          <div className="card-tag-row bond-row">
            {primaryBond ? (
              <BondTag label={GROUP_LABELS[template.group]} memberIds={primaryBond.memberIds} ownedIds={tagOwnedIds} summary={groupDetail(template.group)} />
            ) : (
              <InfoPill className="group-tag" label={GROUP_LABELS[template.group]} tooltip={groupDetail(template.group)} />
            )}
            {secondaryBonds.map((bond) => (
              <BondTag
                className="secondary-bond-tag"
                key={bond.id}
                label={bond.name}
                memberIds={bond.memberIds}
                ownedIds={tagOwnedIds}
                summary={bond.description}
              />
            ))}
          </div>
          <div className="card-tag-row meta-row">
            <InfoPill className={`rarity-tag rarity-${template.rarity}`} label={RARITY_LABELS[template.rarity]} tooltip={rarityDetail(template.rarity)} />
            {template.role && <InfoPill className="group-tag" label={ROLE_LABELS[template.role]} tooltip={roleDetail(template.role)} />}
          </div>
        </div>
        <h3>{template.name}</h3>
        <div className="draft-stats" aria-label={`${template.name}数值`}>
          <span>
            <strong>{template.maxHp}</strong>
            HP
          </span>
          <span>
            <strong>{template.attack}</strong>
            攻击
          </span>
          <span>
            <strong>{template.speed}</strong>
            速度
          </span>
        </div>
        {template.passive && (
          <>
          <div className="draft-ability skill-preview-trigger" tabIndex={0}>
            <span>被动</span>
            <p>{`被动「${template.passive.name}」：${getCompactAbilityDescription(template.passive.description)}`}</p>
          </div>
          <UpgradePreview template={template} />
          </>
        )}
        <div className="draft-ability skill-preview-trigger" tabIndex={0}>
          <span>技能</span>
          <p>{`技能「${template.skill.name}」：${getCompactAbilityDescription(template.skill.description)}`}</p>
        </div>
        <UpgradePreview template={template} />
        <em>{selected ? '已选择' : '点击选择'}</em>
      </div>
    </button>
  );
}

interface BattleScreenProps {
  battle: BattleState;
  boss: BossTemplate;
  gold: number;
  team: Character[];
  onContinue: () => void;
  onToggleSelection: (id: string) => void;
  pendingEnhance: RunState['pendingEnhance'];
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

function BattleScreen({ battle, boss, gold, team, pendingEnhance, pendingBossVictory, onContinue, onToggleSelection, onStart, onEnhance, onDismissEnhancement, onBossBack, onBossBlessing }: BattleScreenProps) {
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
interface ShopScreenProps {
  gold: number;
  offers: CharacterTemplate[];
  selectedOffer: CharacterTemplate | null;
  onSelectOffer: (template: CharacterTemplate | null) => void;
  onBuy: (template: CharacterTemplate) => void;
  onLeave: () => void;
}

function ShopScreen({ gold, offers, selectedOffer, onSelectOffer, onBuy, onLeave }: ShopScreenProps) {
  const [pendingOffer, setPendingOffer] = useState<CharacterTemplate | null>(null);
  const pendingOfferAvailable = pendingOffer ? offers.some((offer) => offer.id === pendingOffer.id) : false;
  const canConfirmPurchase = Boolean(pendingOffer && pendingOfferAvailable && gold >= pendingOffer.price);
  const canBuySelectedOffer = Boolean(selectedOffer && offers.some((offer) => offer.id === selectedOffer.id) && gold >= selectedOffer.price);

  function confirmPurchase() {
    if (!pendingOffer || !canConfirmPurchase) {
      return;
    }
    onBuy(pendingOffer);
    setPendingOffer(null);
    onSelectOffer(null);
  }

  return (
    <div className="flow-screen shop-screen">
      <div className="shop-header">
        <div className="shop-resource-bar">
          <div className="shop-resource-pill gold-pill">
            <span>◎</span>
            <strong>金币 {gold}</strong>
          </div>
          {selectedOffer && (
            <button
              className="primary-button shop-buy-button"
              type="button"
              disabled={!canBuySelectedOffer}
              onClick={() => setPendingOffer(selectedOffer)}
            >
              购买 {selectedOffer.price}金币
            </button>
          )}
        </div>
      </div>

      <div className="shop-recruit-panel">
        <div className="shop-title-block">
          <h2>✦ 招募伙伴 ✦</h2>
          <p>招募新伙伴加入队伍，开启新的巡演之旅！</p>
        </div>
      {offers.length > 0 ? (
        <div className="shop-offer-grid">
          {offers.map((offer) => (
            <ShopOfferCard
              key={offer.id}
              template={offer}
              selected={selectedOffer?.id === offer.id}
              unaffordable={gold < offer.price}
              onClick={() => {
                onSelectOffer(offer);
              }}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">当前可招募角色已经全部加入队伍。</div>
      )}
      </div>
      <button className="primary-button shop-leave-button" onClick={onLeave}>
        离开商店
      </button>
      {pendingOffer && (
        <div className="modal-backdrop">
          <div className="reward-modal shop-confirm-modal">
            <p className="eyebrow">购买确认</p>
            <h2>{pendingOffer.name}</h2>
            <p>
              花费 {pendingOffer.price}金币招募该角色吗？购买后会立即加入队伍。
            </p>
            {!canConfirmPurchase && (
              <div className="empty-state shop-confirm-warning">
                金币不足，当前无法购买。
              </div>
            )}
            <div className="shop-confirm-preview">
              <ShopDetailCharacter character={pendingOffer} upgradeMode="changes" />
            </div>
            <div className="action-row">
              <button className="secondary-button" type="button" onClick={() => setPendingOffer(null)}>
                取消
              </button>
              <button className="primary-button" type="button" disabled={!canConfirmPurchase} onClick={confirmPurchase}>
                确认购买 {pendingOffer.price}金币
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface BlessingScreenProps {
  team: Character[];
  tier: BossTier;
  onContinue: () => void;
}

function BlessingScreen({ team, tier, onContinue }: BlessingScreenProps) {
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

function ShopOfferCard({ template, selected, unaffordable, onClick }: { template: CharacterTemplate; selected?: boolean; unaffordable?: boolean; onClick?: () => void }) {
  return (
    <button className={`shop-offer-card rarity-${template.rarity} ${selected ? 'selected' : ''} ${unaffordable ? 'unaffordable' : ''}`} onClick={onClick} type="button">
      <div className="shop-offer-portrait">
        <img
          alt=""
          src={draftImageSrc(template)}
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      </div>
      <div className="shop-offer-body">
        <h3>{template.name}</h3>
        <div className="shop-offer-stats">
          <span>HP <strong>{template.maxHp}</strong></span>
          <span>攻 <strong>{template.attack}</strong></span>
          <span>速 <strong>{template.speed}</strong></span>
        </div>
      </div>
      <div className="shop-price-button">
        <span>◎</span>
        <strong>{template.price}</strong>
      </div>
    </button>
  );
}

function ShopDetailModal({ team, offers, onClose }: { team: Character[]; offers: CharacterTemplate[]; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="reward-modal shop-detail-modal">
        <p className="eyebrow">商店详细</p>
        <h2>完整信息</h2>
        <p>这里展示当前队伍与本次可招募角色的完整技能、被动和升级效果。</p>
        <div className="shop-detail-sections">
          <section>
            <h3>当前队伍</h3>
            <div className="shop-detail-grid">
              {team.map((member) => <ShopDetailCharacter key={member.id} character={member} />)}
            </div>
          </section>
          <section>
            <h3>可招募</h3>
            <div className="shop-detail-grid">
              {offers.map((offer) => <ShopDetailCharacter key={offer.id} character={offer} />)}
            </div>
          </section>
        </div>
        <div className="action-row">
          <button className="primary-button" type="button" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}

function ShopDetailCharacter({ character, upgradeMode = 'full' }: { character: Character | CharacterTemplate; upgradeMode?: 'full' | 'changes' }) {
  const level = 'upgradeLevel' in character ? character.upgradeLevel : 1;
  const maxLevel = maxUpgradeLevel(character.rarity);
  const templateId = 'templateId' in character ? character.templateId : character.id;
  const upgradeLevels = Array.from({ length: Math.max(0, maxLevel - level) }, (_, index) => level + index + 1);

  return (
    <article className={`shop-detail-card rarity-${character.rarity}`}>
      <div className="shop-detail-portrait">
        <img
          alt=""
          src={draftImageSrc(character)}
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      </div>
      <div className="shop-detail-copy">
        <h4>{character.name}</h4>
        <span>LV{level} · {RARITY_LABELS[character.rarity]} · {GROUP_LABELS[character.group]}{character.role ? ` · ${ROLE_LABELS[character.role]}` : ''}</span>
        <b>HP {character.maxHp} · 攻 {character.attack} · 速 {character.speed}</b>
        {character.passive && <p>被动「{character.passive.name}」：{character.passive.description}</p>}
        <p>技能「{character.skill.name}」：{character.skill.description}</p>
        <div className="shop-upgrade-lines">
          <strong>{upgradeMode === 'changes' ? '升级变化' : '升级效果'}</strong>
          {upgradeMode === 'changes' ? (
            upgradeLevels.length > 0 ? upgradeLevels.map((targetLevel) => (
              <small key={targetLevel}>LV{targetLevel}：<HighlightText text={getEnhancementChangeLines(templateId, targetLevel).join('；')} /></small>
            )) : (
              <small>已达到最高等级。</small>
            )
          ) : (
            Array.from({ length: maxLevel }, (_, index) => index + 1).map((targetLevel) => (
              <small key={targetLevel}>LV{targetLevel}：{getUpgradeEffectLines(templateId, targetLevel).join('；') || '基础效果'}</small>
            ))
          )}
        </div>
      </div>
    </article>
  );
}

interface EnhanceModalProps {
  gold: number;
  pending: { source: 'elite' | 'boss'; cost: number; free: boolean };
  team: Character[];
  onEnhance: (id: string | null) => void;
  onDismiss: () => void;
}

function EnhanceModal({ gold, pending, team, onEnhance, onDismiss }: EnhanceModalProps) {
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

interface RestScreenProps {
  gold: number;
  team: Character[];
  healUsed: boolean;
  reviveUsed: boolean;
  onHeal: (id: string, healType: HealType) => void;
  onRevive: (id: string) => void;
  onLeave: () => void;
}

type RestAction = HealType | 'revive';

function RestScreen({ gold, team, healUsed, reviveUsed, onHeal, onRevive, onLeave }: RestScreenProps) {
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

interface ResultScreenProps {
  result: ResultState;
  log: string[];
  stats: BattleStats;
  team: Character[];
  onContinue: () => void;
}

function ResultScreen({ result, log, stats, team, onContinue }: ResultScreenProps) {
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

interface EndScreenProps {
  title: string;
  body: string;
  log: string[];
  stats?: BattleStats;
  team: Character[];
  enemies?: Character[];
  onRetryBattle?: () => void;
  onRestart: () => void;
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

function EndScreen({ title, body, log, stats, team, enemies = [], onRetryBattle, onRestart }: EndScreenProps) {
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

interface TemplateCardProps {
  template: CharacterTemplate;
  selected?: boolean;
  disabled?: boolean;
  footer?: string;
  onClick?: () => void;
}

function TemplateCard({ template, selected = false, disabled = false, footer, onClick }: TemplateCardProps) {
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

function CharacterCard({ character, selected = false, disabled = false, onClick }: CharacterCardProps) {
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

function CompactCharacter({ character }: { character: Character }) {
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

function DamageMeter({ stats, team, title }: { stats: BattleStats; team: Character[]; title: string }) {
  const orderedStats = getOrderedStats(team, stats);
  const maxDamage = Math.max(1, ...orderedStats.map((stat) => stat.damageDealt));
  const maxTaken = Math.max(1, ...orderedStats.map((stat) => stat.damageTaken));
  const maxShieldBlocked = Math.max(1, ...orderedStats.map((stat) => stat.shieldBlocked));

  return (
    <section className="damage-meter" aria-label={title}>
      <h3>{title}</h3>
      <div className="damage-meter-list">
        {orderedStats.map((stat) => (
          <div className={`damage-meter-row ${stats[stat.characterId] ? '' : 'not-deployed'}`.trim()} key={stat.characterId}>
            {team.find((member) => member.id === stat.characterId) && (
              <div className="damage-meter-avatar">
                <Avatar character={team.find((member) => member.id === stat.characterId)!} label={stat.name} small />
              </div>
            )}
            <div className="damage-meter-bars">
              <div className="damage-bar-line damage-dealt-line">
                <span className="damage-bar-label">造成伤害</span>
                <span className="damage-bar-track">
                  <span style={{ width: `${stat.damageDealt === 0 ? 0 : Math.max(8, Math.round((stat.damageDealt / maxDamage) * 100))}%` }} />
                </span>
                <b>{stat.damageDealt}</b>
              </div>
              <div className="damage-bar-line damage-taken-line">
                <span className="damage-bar-label">承受伤害</span>
                <span className="damage-bar-track">
                  <span style={{ width: `${stat.damageTaken === 0 ? 0 : Math.max(8, Math.round((stat.damageTaken / maxTaken) * 100))}%` }} />
                </span>
                <b>{stat.damageTaken}</b>
              </div>
              <div className="damage-bar-line shield-blocked-line">
                <span className="damage-bar-label">护盾抵挡</span>
                <span className="damage-bar-track">
                  <span style={{ width: `${stat.shieldBlocked === 0 ? 0 : Math.max(8, Math.round((stat.shieldBlocked / maxShieldBlocked) * 100))}%` }} />
                </span>
                <b>{stat.shieldBlocked}</b>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BattleResultModal({ phase, stats, team, primaryLabel = '返回', onClose }: { phase: BattleState['phase']; stats: BattleStats; team: Character[]; primaryLabel?: string; onClose: () => void }) {
  const [showStats, setShowStats] = useState(false);
  const isLost = phase === 'lost';

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="reward-modal battle-result-modal" role="dialog" aria-modal="true" aria-label="战斗结果" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <h2>{isLost ? '战斗失败' : '战斗胜利'}</h2>
        </div>
        <p className="battle-result-modal-copy">
          {isLost ? '所有可出战角色都已无法继续战斗。' : '敌方已被击败，我方保留战后生命值。'}
        </p>
        {showStats && <DamageMeter stats={stats} team={team} title="伤害统计" />}
        <div className="battle-result-modal-actions">
          <button className="secondary-button" onClick={() => setShowStats((visible) => !visible)} type="button">
            {showStats ? '收起伤害统计' : '查看伤害统计'}
          </button>
          <button className="primary-button" onClick={onClose} type="button">
            {primaryLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function RunStatsModal({ stats, team, onClose }: { stats: BattleStats; team: Character[]; onClose: () => void }) {
  const orderedStats = getOrderedStats(team, stats);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="reward-modal stats-modal" role="dialog" aria-modal="true" aria-label="本局统计" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <h2>本局统计</h2>
          <button className="ghost-button" onClick={onClose} type="button">
            关闭
          </button>
        </div>
        <div className="run-stat-list">
          {orderedStats.map((stat) => (
            <div className="run-stat-card" key={stat.characterId}>
              <div className="run-stat-card-heading">
                {team.find((member) => member.id === stat.characterId) && (
                  <Avatar character={team.find((member) => member.id === stat.characterId)!} label={stat.name} small />
                )}
                <h3>{stat.name}</h3>
              </div>
              <p>总伤害：{stat.damageDealt}</p>
              <p>承伤：{stat.damageTaken}</p>
              <p>护盾抵挡：{stat.shieldBlocked}</p>
              <p>暴击：{stat.criticalHits}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const LOG_WORDS = {
  attack: '\u653b\u51fb',
  damage: '\u4f24\u5bb3',
  hpLeft: '\u5269\u4f59',
  startBattle: '\u5f00\u59cb\u56e2\u961f\u6218\u6597\uff1a',
  battleStartShort: '\u5f00\u6218\uff1a',
  enterField: '\u540c\u65f6\u4e0a\u573a\u3002',
  enterFieldShort: '\u4e0a\u573a\u3002',
  victory: '\u6218\u6597\u80dc\u5229\uff0c\u83b7\u5f97',
  victoryShort: '\u80dc\u5229\uff1a\u83b7\u5f97',
  injured: '\u8fdb\u5165\u91cd\u4f24\u72b6\u6001\u3002',
  injuredShort: '\u91cd\u4f24\u3002',
  relay: '\u672c\u7ec4\u89d2\u8272\u5df2\u65e0\u6cd5\u7ee7\u7eed\u6218\u6597\uff0c\u8bf7\u9009\u62e9',
  relayShort: '\u63a5\u529b\uff1a\u8bf7\u9009\u62e9',
  defeated: '\u88ab\u51fb\u8d25',
  failed: '\u6311\u6218\u5931\u8d25',
  heal: '\u6062\u590d',
  shield: '\u62a4\u76fe',
  poisonDamage: '\u6bd2\u4f24\u5bb3',
  roundPrefix: '\u7b2c',
  roundSuffix: '\u56de\u5408\u3002',
  combo: '\u8fde\u51fb',
  hits: '\u6b21',
  total: '\u5171',
  mainOutput: '\u662f\u4e3b\u8981\u8f93\u51fa\uff0c\u9020\u6210',
  shieldBlocked: '\u62a4\u76fe\u62b5\u6321',
  mostTaken: '\u627f\u53d7\u6700\u591a\u4f24\u5bb3\uff1a',
  summary: '\u6218\u6597\u603b\u7ed3',
  title: '\u6218\u6597\u65e5\u5fd7',
  collapse: '\u6536\u8d77\u7ec6\u8282',
  expand: '\u5c55\u5f00\u7ec6\u8282',
};

type BattleLogLevel = 'major' | 'action' | 'detail';

interface ReadableBattleLogEntry {
  id: string;
  text: string;
  level: BattleLogLevel;
  round: number | null;
}

function shortenBattleLogEntry(entry: string) {
  const attackMatch = entry.match(new RegExp(`^(.+?)${LOG_WORDS.attack}(.+?)\uff0c\u9020\u6210(\\d+)${LOG_WORDS.damage}\uff0c.+?${LOG_WORDS.hpLeft}(\\d+)HP\u3002$`));
  if (attackMatch) {
    return `${attackMatch[1]} -> ${attackMatch[2]}: ${attackMatch[3]}${LOG_WORDS.damage}${LOG_WORDS.hpLeft}${attackMatch[4]}HP`;
  }

  return entry
    .replace(LOG_WORDS.startBattle, LOG_WORDS.battleStartShort)
    .replace(LOG_WORDS.enterField, LOG_WORDS.enterFieldShort)
    .replace(LOG_WORDS.victory, LOG_WORDS.victoryShort)
    .replace(LOG_WORDS.injured, LOG_WORDS.injuredShort)
    .replace(LOG_WORDS.relay, LOG_WORDS.relayShort);
}

function getBattleLogLevel(entry: string): BattleLogLevel {
  if (
    entry.includes(LOG_WORDS.battleStartShort) ||
    entry.includes(LOG_WORDS.startBattle) ||
    entry.includes(LOG_WORDS.defeated) ||
    entry.includes(LOG_WORDS.victory) ||
    entry.includes(LOG_WORDS.failed) ||
    entry.includes(LOG_WORDS.injuredShort.slice(0, 2)) ||
    new RegExp(`^${LOG_WORDS.roundPrefix}\\d+${LOG_WORDS.roundSuffix}$`).test(entry)
  ) {
    return 'major';
  }

  if (entry.includes(LOG_WORDS.attack) || entry.includes(LOG_WORDS.heal) || entry.includes(LOG_WORDS.shield) || entry.includes(LOG_WORDS.poisonDamage)) {
    return 'action';
  }

  return 'detail';
}

function buildReadableBattleLog(entries: string[]): ReadableBattleLogEntry[] {
  let currentRound: number | null = null;

  return entries.map((entry, index) => {
    const roundMatch = entry.match(new RegExp(`^${LOG_WORDS.roundPrefix}(\\d+)${LOG_WORDS.roundSuffix}$`));
    if (roundMatch) {
      currentRound = Number(roundMatch[1]);
    }

    return {
      id: `${entry}-${index}`,
      text: shortenBattleLogEntry(entry),
      level: getBattleLogLevel(entry),
      round: currentRound,
    };
  });
}

function mergeConsecutiveAttacks(entries: ReadableBattleLogEntry[]) {
  const merged: ReadableBattleLogEntry[] = [];
  const attackPattern = new RegExp(`^(.+?) -> (.+?): (\\d+)${LOG_WORDS.damage}${LOG_WORDS.hpLeft}(\\d+)HP$`);
  const comboPattern = new RegExp(`^(.+?) ${LOG_WORDS.combo} (.+?): (\\d+)${LOG_WORDS.hits}\uff0c${LOG_WORDS.total}(\\d+)${LOG_WORDS.damage}${LOG_WORDS.hpLeft}(\\d+)HP$`);

  entries.forEach((entry) => {
    const current = entry.text.match(attackPattern);
    const previous = merged[merged.length - 1];
    const previousCombo = previous?.text.match(comboPattern);
    const previousAttack = previous?.text.match(attackPattern);

    if (current && previous && previous.round === entry.round) {
      const previousActor = previousCombo?.[1] ?? previousAttack?.[1];
      const previousTarget = previousCombo?.[2] ?? previousAttack?.[2];
      if (previousActor === current[1] && previousTarget === current[2]) {
        const previousHits = previousCombo ? Number(previousCombo[3]) : 1;
        const previousDamage = previousCombo ? Number(previousCombo[4]) : Number(previousAttack?.[3] ?? 0);
        previous.text = `${current[1]} ${LOG_WORDS.combo} ${current[2]}: ${previousHits + 1}${LOG_WORDS.hits}\uff0c${LOG_WORDS.total}${previousDamage + Number(current[3])}${LOG_WORDS.damage}${LOG_WORDS.hpLeft}${current[4]}HP`;
        previous.level = 'action';
        return;
      }
    }

    merged.push({ ...entry });
  });

  return merged;
}

function BattleLogSummary({ stats, team }: { stats?: BattleStats; team?: Character[] }) {
  if (!stats || !team || team.length === 0) {
    return null;
  }

  const ordered = getOrderedStats(team, stats);
  const topDamage = ordered.reduce((best, stat) => (stat.damageDealt > best.damageDealt ? stat : best), ordered[0]);
  const topShield = ordered.reduce((best, stat) => (stat.shieldBlocked > best.shieldBlocked ? stat : best), ordered[0]);
  const topTaken = ordered.reduce((best, stat) => (stat.damageTaken > best.damageTaken ? stat : best), ordered[0]);
  const lines = [
    topDamage?.damageDealt > 0 ? `${topDamage.name} ${LOG_WORDS.mainOutput} ${topDamage.damageDealt} ${LOG_WORDS.damage}\u3002` : null,
    topShield?.shieldBlocked > 0 ? `${topShield.name} ${LOG_WORDS.shieldBlocked} ${topShield.shieldBlocked} ${LOG_WORDS.damage}\u3002` : null,
    topTaken?.damageTaken > 0 ? `${topTaken.name} ${LOG_WORDS.mostTaken}${topTaken.damageTaken}\u3002` : null,
  ].filter((line): line is string => Boolean(line));

  if (lines.length === 0) {
    return null;
  }

  return (
    <div className="battle-log-summary">
      <strong>{LOG_WORDS.summary}</strong>
      {lines.map((line) => <span key={line}>{line}</span>)}
    </div>
  );
}

function BattleLog({ entries, stats, team, extraAction }: { entries: string[]; stats?: BattleStats; team?: Character[]; extraAction?: { label: string; onClick: () => void } }) {
  const [showDetails, setShowDetails] = useState(false);
  const [showDamage, setShowDamage] = useState(false);
  const readableEntries = mergeConsecutiveAttacks(buildReadableBattleLog(entries));
  const visibleEntries = showDetails ? readableEntries : readableEntries.filter((entry) => entry.level !== 'detail');
  const canShowDamage = Boolean(stats && team && team.length > 0);

  return (
    <div className="battle-log" aria-live="polite">
      <div className="battle-log-heading">
        <h3>{LOG_WORDS.title}</h3>
        <div className="battle-log-actions">
          {extraAction && (
            <button className="ghost-button battle-log-retry-button" type="button" onClick={extraAction.onClick}>
              {extraAction.label}
            </button>
          )}
          {canShowDamage && (
            <button className="ghost-button" type="button" onClick={() => setShowDamage((visible) => !visible)}>
              {showDamage ? '收起伤害' : '本场伤害'}
            </button>
          )}
          <button className="ghost-button" type="button" onClick={() => setShowDetails((visible) => !visible)}>
            {showDetails ? LOG_WORDS.collapse : LOG_WORDS.expand}
          </button>
        </div>
      </div>
      {showDamage && stats && team && (
        <div className="battle-log-damage">
          <DamageMeter stats={stats} team={team} title="本场伤害" />
        </div>
      )}
      <BattleLogSummary stats={stats} team={team} />
      <ol>
        {visibleEntries.map((entry) => (
          <li className={`battle-log-entry log-${entry.level}`} key={entry.id}>
            <span>{entry.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
export default App;
