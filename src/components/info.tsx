import type { CharacterTemplate } from '../game';
import { BOND_GROUPS, GROUP_LABELS } from '../game';

export function groupDetail(groupId: CharacterTemplate['group']) {
  const group = BOND_GROUPS.find((bond) => bond.id === groupId);
  if (!group) {
    return `${GROUP_LABELS[groupId]}：主羁绊。`;
  }
  return `${group.name}。2人：${group.level2Description} 3人：${group.level3Description}`;
}

export function rarityDetail(rarity: CharacterTemplate['rarity']) {
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

export function roleDetail(role: CharacterTemplate['role']) {
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

export function InfoPill({ className, label, tooltip }: { className: string; label: string; tooltip: string }) {
  return (
    <span className={`${className} info-pill`.trim()} data-tooltip={tooltip} tabIndex={0}>
      {label}
    </span>
  );
}
