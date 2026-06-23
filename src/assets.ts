import type { MapNode } from './game';

export type MusicKey = 'home' | 'draftShop' | 'battle' | 'rest' | 'map';
export type SfxKey = 'mapSelect' | 'next' | 'buy' | 'battleVictory';

export const MUSIC_SRC: Record<MusicKey, string> = {
  home: '/audio/home.mp3',
  draftShop: '/audio/draft-shop.mp3',
  battle: '/audio/battle.mp3',
  rest: '/audio/rest.mp3',
  map: '/audio/home.mp3',
};

export const SFX_SRC: Record<SfxKey, string> = {
  mapSelect: '/audio/map-select.mp3',
  next: '/audio/next.mp3',
  buy: '/audio/buy.mp3',
  battleVictory: '/audio/battle-victory.mp3',
};

export const BOND_LOGO_SRC: Record<string, string> = {
  cute: '/ui/bond-logos/cute.png',
  silver: '/ui/bond-logos/silver.png',
  president: '/ui/bond-logos/president.png',
  mystery: '/ui/bond-logos/mystery.png',
  little_devil: '/ui/bond-logos/little_devil.png',
  nozoeli: '/ui/bond-logos/nozoeli.png',
  angel: '/ui/bond-logos/angel.png',
  dreamer: '/ui/bond-logos/dreamer.png',
  lucky_star: '/ui/bond-logos/lucky_star.png',
  campus_leader: '/ui/bond-logos/campus_leader.png',
  full_speed: '/ui/bond-logos/full_speed.png',
  energetic_idol: '/ui/bond-logos/energetic_idol.png',
};

export const DRAFT_IMAGE_BY_ID: Record<string, string> = {
  ayumu: '/cards/Image/102Uehara-Ayumu-KN13pl.png',
  rina: '/cards/Image/97Tennoji-Rina-YB8JUo.png',
  nico: '/cards/heroes/skins/nico-legendary.png',
  kotori: '/cards/Image/9Minami-Kotori-BkWR39.png',
  keke: '/cards/heroes/skins/keke-legendary.png',
  you: '/cards/Image/17Watanabe-You-En1r2L.png',
  eli: '/cards/Image/1Ayase-Eli-wRbUwD.png',
  mari: '/cards/heroes/skins/mari-legendary.png',
  ren: '/cards/Image/122Hazuki-Ren-fZ9vXK.png',
  yoshiko: '/cards/Image/16Tsushima-Yoshiko-NdFuZH.png',
  nozomi: '/cards/Image/15Toujou-Nozomi-S678cZ.png',
  kanata: '/cards/heroes/skins/kanata-legendary.png',
};

export const NODE_ICON_SRC: Record<MapNode['type'], string> = {
  battle: '/ui/node-icons/battle.png',
  elite: '/ui/node-icons/elite.png',
  shop: '/ui/node-icons/shop.png',
  rest: '/ui/node-icons/rest.png',
  boss: '/ui/node-icons/boss.png',
};
