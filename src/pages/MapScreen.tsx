import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import {
  NODE_LABELS,
  getActiveBonds,
  getActiveSecondaryBonds,
  type BattleStats,
  type BossTemplate,
  type Character,
  type MapNode,
} from '../game';
import { BOND_LOGO_SRC, NODE_ICON_SRC } from '../assets';
import { Avatar } from '../components/common';

export interface MapScreenProps {
  nodes: MapNode[];
  boss: BossTemplate;
  team: Character[];
  stats: BattleStats;
  gold: number;
  musicMuted: boolean;
  onToggleMusic: () => void;
  onEnter: (node: MapNode) => void;
  onOpenStats: () => void;
}

function BossForecast({ boss }: { boss: BossTemplate }) {
  return (
    <section className="boss-forecast" aria-label="本层 Boss 预告">
      <div className="boss-portrait-strip">
        <Avatar character={boss} label={boss.name} />
      </div>
      <div className="boss-forecast-copy">
        <h3>
          <span className="boss-crown">♛</span> 本层Boss：{boss.name}
          <span className="boss-type-pill">{boss.feature}</span>
        </h3>
        {boss.passive && <p>被动：{boss.passive.description}</p>}
      </div>
      <button className="codex-button" type="button">
        <span>▣</span>
        Boss图鉴
      </button>
    </section>
  );
}

const NODE_HELP: Record<MapNode['type'], string> = {
  battle: '击败敌人',
  elite: '更强敌人',
  shop: '招募角色/道具',
  rest: '恢复生命/移除卡牌',
  boss: '击败Boss前往下一层',
};
const MAP_ROW_Y: Record<number, number> = {
  5: 8,
  4: 24,
  3: 40,
  2: 56,
  1: 72,
  0: 88,
};

function getNodeX(node: MapNode) {
  const rowSize = node.row === 5 ? 1 : node.row === 4 ? 2 : 3;
  if (rowSize === 1) {
    return 50;
  }
  if (rowSize === 2) {
    return node.col === 0 ? 38 : 62;
  }
  return [28, 50, 72][node.col] ?? 50;
}

function getNodePosition(node: MapNode) {
  return {
    x: getNodeX(node),
    y: MAP_ROW_Y[node.row] ?? 50,
  };
}

function getRouteConnections(nodes: MapNode[]) {
  const byRow = new Map<number, MapNode[]>();
  nodes.forEach((node) => {
    byRow.set(node.row, [...(byRow.get(node.row) ?? []), node]);
  });

  return nodes.flatMap((fromNode) => {
    if (!fromNode.available && !fromNode.completed) {
      return [];
    }

    const nextNodes = byRow.get(fromNode.row + 1) ?? [];
    return nextNodes
      .filter((toNode) => Math.abs(toNode.col - fromNode.col) <= 1)
      .filter((toNode) => fromNode.available || toNode.available || toNode.completed)
      .map((toNode) => ({
        id: `${fromNode.id}-${toNode.id}`,
        from: getNodePosition(fromNode),
        to: getNodePosition(toNode),
        preview: fromNode.available && !fromNode.completed,
        reachable: fromNode.completed && toNode.available,
        completed: fromNode.completed && toNode.completed,
      }));
  });
}

function MapRoutes({ connections }: { connections: ReturnType<typeof getRouteConnections> }) {
  return (
    <svg className="route-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id="routeLineTexture" patternUnits="userSpaceOnUse" width="14" height="4">
          <image href="/ui/route-lines/pink-route.png" x="0" y="0" width="14" height="4" preserveAspectRatio="none" />
        </pattern>
      </defs>
      {connections.map((connection) => (
        <line
          className={`route-line ${connection.preview ? 'preview' : ''} ${connection.reachable ? 'reachable' : ''} ${connection.completed ? 'completed' : ''}`}
          key={connection.id}
          stroke="url(#routeLineTexture)"
          x1={connection.from.x}
          y1={connection.from.y}
          x2={connection.to.x}
          y2={connection.to.y}
        />
      ))}
    </svg>
  );
}

function MapNodeButton({ node, onEnter }: { node: MapNode; onEnter: (node: MapNode) => void }) {
  const position = getNodePosition(node);

  return (
    <button
      className={`map-node node-${node.type} ${node.completed ? 'completed' : ''} ${node.available ? 'available' : ''}`}
      disabled={!node.available || node.completed}
      onClick={() => onEnter(node)}
      style={{ '--node-x': `${position.x}%`, '--node-y': `${position.y}%` } as CSSProperties}
      type="button"
    >
      <span className="node-orb"><img className="node-icon-art" src={NODE_ICON_SRC[node.type]} alt="" /></span>
    </button>
  );
}

function TeamDock({ team }: { team: Character[] }) {
  const slots = Array.from({ length: 4 }, (_, index) => team[index] ?? null);

  return (
    <section className="hud-card team-dock">
      <div className="hud-card-heading">
        <h3>当前队伍</h3>
        <span>{team.length}/4</span>
      </div>
      <div className="team-dock-grid">
        {slots.map((member, index) =>
          member ? (
            <div className={`team-dock-member rarity-${member.rarity}`} key={member.id}>
              <Avatar character={member} label={member.name} />
              <span>
                {member.hp}/{member.maxHp}
              </span>
            </div>
          ) : (
            <div className="team-empty-slot" key={`empty-${index}`}>
              <span>＋</span>
            </div>
          ),
        )}
      </div>
      <button className="hud-wide-button" type="button">详细</button>
    </section>
  );
}

function BondProgressDock({ team }: { team: Character[] }) {
  const primaryBonds = getActiveBonds(team);
  const secondaryBonds = getActiveSecondaryBonds(team).filter((bond) => bond.count > 0);
  const visibleBonds = [
    ...primaryBonds.slice(0, 4).map((bond) => ({
      id: bond.group.id,
      name: bond.group.name,
      count: bond.count,
      total: 3,
      active: bond.level > 0,
      secondary: false,
      logoSrc: BOND_LOGO_SRC[bond.group.id],
    })),
    ...secondaryBonds.slice(0, 2).map((bond) => ({
      id: bond.bond.id,
      name: bond.bond.name,
      count: bond.count,
      total: 2,
      active: bond.active,
      secondary: true,
      logoSrc: BOND_LOGO_SRC[bond.bond.id],
    })),
  ];

  return (
    <section className="hud-card bond-progress-dock">
      <div className="hud-card-heading">
        <h3>羁绊进度</h3>
        <span>i</span>
      </div>
      <div className="bond-progress-list">
        {visibleBonds.map((bond) => (
          <div className={`bond-progress-row ${bond.secondary ? 'secondary' : ''}`} key={bond.id}>
            <span className="bond-dot"><img src={bond.logoSrc} alt="" /></span>
            <em>{bond.count}/{bond.total}</em>
          </div>
        ))}
      </div>
      <button className="hud-wide-button" type="button">详细</button>
    </section>
  );
}

function MapLegend() {
  const entries: MapNode['type'][] = ['battle', 'elite', 'shop', 'rest', 'boss'];

  return (
    <aside className="map-legend">
      <h3>节点说明</h3>
      {entries.map((type) => (
        <div className={`legend-row node-${type}`} key={type}>
          <span><img className="legend-icon-art" src={NODE_ICON_SRC[type]} alt="" /></span>
          <div>
            <strong>{NODE_LABELS[type]}</strong>
            <small>{NODE_HELP[type]}</small>
          </div>
        </div>
      ))}
    </aside>
  );
}

function MapActions() {
  return (
    <aside className="map-actions">
      <button type="button">
        <span>▣</span>
        成就
      </button>
      <button type="button">
        <span>☷</span>
        事件日志
      </button>
    </aside>
  );
}

export function MapScreen({ nodes, boss, team, stats, gold, musicMuted, onToggleMusic, onEnter, onOpenStats }: MapScreenProps) {
  const routeConnections = useMemo(() => getRouteConnections(nodes), [nodes]);
  const livingHp = team.reduce((sum, member) => sum + Math.max(0, member.hp), 0);
  const maxHp = team.reduce((sum, member) => sum + member.maxHp, 0);
  const hasStats = team.some((member) => {
    const stat = stats[member.id];
    return Boolean(stat && (stat.damageDealt > 0 || stat.damageTaken > 0 || stat.criticalHits > 0));
  });

  return (
    <div className="map-hud-screen">
      <header className="map-hud-topbar">
        <button className="map-back-button" type="button" aria-label="返回">‹</button>
        <h2>第{boss.bossTier}层</h2>
        <div className="map-resource-row">
          <span className="resource-pill coin">◎ {gold}</span>
          <span className="resource-pill heart">♥ {livingHp}/{maxHp || 0}</span>
          <button className="settings-button stats-settings-button" disabled={!hasStats} onClick={onOpenStats} type="button" aria-label="本局统计">📊</button>
        </div>
      </header>

      <BossForecast boss={boss} />

      <div className="map-stage">
        <aside className="map-left-rail">
          <TeamDock team={team} />
          <BondProgressDock team={team} />
        </aside>
        <div className="map-board">
          <MapRoutes connections={routeConnections} />
          {nodes.map((node) => (
            <MapNodeButton key={node.id} node={node} onEnter={onEnter} />
          ))}
        </div>
        <aside className="map-right-rail">
          <MapActions />
          <MapLegend />
        </aside>
      </div>
    </div>
  );
}
