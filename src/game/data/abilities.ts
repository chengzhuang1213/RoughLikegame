import type { Ability, SkillId } from '../types';

export const ENEMY_BASIC_SKILL: Ability<SkillId> = {
  id: 'enemy_basic',
  name: '普通攻击',
  description: '无主动技能，只依靠被动机制和基础攻击。',
};
