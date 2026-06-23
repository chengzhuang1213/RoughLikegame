import type { ActiveBond, ActiveSecondaryBond, Character, CharacterTemplate, GroupId, SecondaryBondId } from './types';
import { BOND_GROUPS, SECONDARY_BONDS } from './data/bonds';

export function getActiveBonds(characters: Array<Character | CharacterTemplate>): ActiveBond[] {
  const ownedIds = new Set(
    characters.map((character) => ('templateId' in character ? character.templateId : character.id)),
  );

  return BOND_GROUPS.map((group) => {
    const count = group.memberIds.filter((id) => ownedIds.has(id)).length;
    return {
      group,
      count,
      level: count >= 3 ? 3 : count >= 2 ? 2 : 0,
    };
  });
}

export function hasBond(characters: Character[], groupId: GroupId, level: 2 | 3): boolean {
  const bond = getActiveBonds(characters).find((activeBond) => activeBond.group.id === groupId);
  return Boolean(bond && bond.level >= level);
}

export function getActiveSecondaryBonds(
  characters: Array<Character | CharacterTemplate>,
): ActiveSecondaryBond[] {
  const ownedIds = new Set(
    characters.map((character) => ('templateId' in character ? character.templateId : character.id)),
  );

  return SECONDARY_BONDS.map((bond) => {
    const count = bond.memberIds.filter((id) => ownedIds.has(id)).length;
    return {
      bond,
      count,
      active: count === bond.memberIds.length,
    };
  });
}

export function hasSecondaryBond(characters: Character[], bondId: SecondaryBondId): boolean {
  return getActiveSecondaryBonds(characters).some(
    (activeBond) => activeBond.bond.id === bondId && activeBond.active,
  );
}
