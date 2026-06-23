import type { BattleType, GroupId, IdolRarity, NodeType } from '../types';

export const GROUP_LABELS: Record<GroupId, string> = {
  cute: '可爱甜心',
  silver: '古灵精怪',
  president: '风纪委员',
  mystery: '命运之子',
};


export const RARITY_LABELS: Record<IdolRarity, string> = {
  legendary: '传奇偶像',
  star: '明星偶像',
  normal: '普通偶像',
  enemy: '小怪',
  elite: '精英',
  boss: 'Boss',
};

export const NODE_LABELS: Record<NodeType, string> = {
  battle: '战斗',
  elite: '精英战',
  shop: '商店',
  rest: '休息处',
  boss: 'Boss',
};

export const REWARD_GOLD: Record<BattleType, number> = {
  battle: 8,
  elite: 35,
  boss: 60,
};
