import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ParcelPeriodInfo } from "./types";

interface PolygonData {
  id: string;
  name: string;
  visible: boolean;
  color?: string;
  status?: string;
  canEdit?: boolean;
  parentId?: string | null;
  parcelPeriods?: ParcelPeriodInfo[];
  farmId?: number;
}

interface PolygonListProps {
  polygons: PolygonData[];
  onToggle: (id: string) => void;
  onFocus?: (id: string) => void;
  onApproveSingle?: (id: string) => void;
  onContextMenu?: (id: string, x: number, y: number) => void;
  emptyLabel?: string;
  showStatus?: boolean;
}

export default function PolygonList({ polygons, onToggle, onFocus, onApproveSingle, onContextMenu, emptyLabel, showStatus }: PolygonListProps) {
  const { t } = useTranslation();
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set());
  const togglePeriodsExpanded = (id: string) => setExpandedPeriods(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const groups = useMemo(() => {
    const byId = new Map(polygons.map(p => [p.id, p]));
    const ids = new Set(polygons.map(p => p.id));

    const rootOf = (start: PolygonData): PolygonData => {
      const visited = new Set<string>();
      let cur = start;
      while (cur.parentId && ids.has(cur.parentId) && !visited.has(cur.id)) {
        visited.add(cur.id);
        const parent = byId.get(cur.parentId);
        if (!parent) break;
        cur = parent;
      }
      return cur;
    };

    const membersByRoot = new Map<string, PolygonData[]>();
    for (const p of polygons) {
      const r = rootOf(p);
      const arr = membersByRoot.get(r.id);
      if (arr) arr.push(p);
      else membersByRoot.set(r.id, [p]);
    }

    const seenRoots = new Set<string>();
    const ordered: { root: PolygonData; members: PolygonData[] }[] = [];
    for (const p of polygons) {
      const r = rootOf(p);
      if (seenRoots.has(r.id)) continue;
      seenRoots.add(r.id);
      ordered.push({ root: r, members: membersByRoot.get(r.id) || [r] });
    }
    return ordered;
  }, [polygons]);

  if (!polygons.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-center text-sm text-slate-500">
        {emptyLabel || t('map.polygonList.empty') || 'No polygons yet'}
      </div>
    );
  }

  const renderGroup = ({ root, members }: { root: PolygonData; members: PolygonData[] }) => {
    const color = root.color || '#4f46e5';
    const status = (root.status || '').toUpperCase();
    const isLive = status === 'LIVE';
    const canApprove = !isLive;
    const canReapprove = false;

    const anyVisible = members.some(m => m.visible);
    const toggleGroupVisibility = () => {
      const target = !anyVisible;
      for (const m of members) {
        if (m.visible !== target) onToggle(m.id);
      }
    };

    const allChips = members.flatMap(m => m.parcelPeriods || []);
    const dedup = new Map<number, ParcelPeriodInfo>();
    for (const pp of allChips) {
      if (!dedup.has(pp.id)) dedup.set(pp.id, pp);
    }
    const chips = Array.from(dedup.values()).sort((a, b) => {
      const nameA = a.periodName || '';
      const nameB = b.periodName || '';
      if (nameA && nameB) return nameA.localeCompare(nameB);
      return a.periodId - b.periodId;
    });

    const memberCount = members.length;

    const onCardContextMenu = (e: React.MouseEvent) => {
      if (onContextMenu) { e.preventDefault(); onContextMenu(root.id, e.clientX, e.clientY); }
    };

    return (
      <li key={root.id} className="flex flex-col gap-2">
        <div
          className="group relative overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 p-3 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
          onContextMenu={onCardContextMenu}
          title={onContextMenu ? t('map.polygonList.rightClickOptions', { defaultValue: 'Right-click for options' }) : undefined}
        >
          <span
            className="pointer-events-none absolute inset-y-3 left-2.5 w-1 rounded-full opacity-70 transition group-hover:opacity-100"
            style={{ background: color }}
          />
          <div className="flex items-start gap-2 pl-4">
            <div className="flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900" title={root.name}>
                  {root.name || t('map.polygonList.placeholder', { defaultValue: 'Polygon name' })}
                </span>
                {memberCount > 1 && (
                  <span
                    className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700"
                    title={t('map.polygonList.linkedCount', { defaultValue: '{{n}} linked parcels (same physical field)', n: memberCount })}
                  >
                    × {memberCount}
                  </span>
                )}
                {showStatus && root.status && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {root.status}
                  </span>
                )}
                {onApproveSingle && canApprove && (
                  <button
                    type="button"
                    onClick={() => onApproveSingle(root.id)}
                    className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 transition hover:border-emerald-200 hover:bg-emerald-100"
                  >
                    {canReapprove ? t('imports.map.reapproveOne', { defaultValue: 'Re-approve' }) : t('imports.map.approveOne', { defaultValue: 'Approve' })}
                  </button>
                )}
              </div>
              {/* Map actions */}
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="shrink-0 text-slate-400" aria-hidden title={t('map.polygonList.mapActions', { defaultValue: 'Map' })}>🗺️</span>
                <button
                  type="button"
                  onClick={toggleGroupVisibility}
                  className={`shrink-0 rounded-full px-2 py-0.5 font-medium transition ${
                    anyVisible ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {anyVisible ? t('map.polygonList.visibleShort', { defaultValue: 'Shown' }) : t('map.polygonList.hiddenShort', { defaultValue: 'Hidden' })}
                </button>
                {onFocus && (
                  <button
                    type="button"
                    onClick={() => onFocus(root.id)}
                    className="shrink-0 rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 font-semibold text-indigo-700 transition hover:border-indigo-200 hover:bg-indigo-100"
                  >
                    {t('map.polygonList.centerShort', { defaultValue: 'Center' })}
                  </button>
                )}
              </div>
              {/* Period chips */}
              {chips.length > 0 && (() => {
                const isExpanded = expandedPeriods.has(root.id);
                const activeCount = chips.filter(pp => pp.active).length;
                return (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => togglePeriodsExpanded(root.id)}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-200"
                      aria-expanded={isExpanded}
                      title={t('map.polygonList.togglePeriods', { defaultValue: 'Show/hide periods' })}
                    >
                      <span aria-hidden>{isExpanded ? '▾' : '▸'}</span>
                      <span>
                        {t('map.polygonList.periodsLabel', {
                          defaultValue: '{{active}}/{{total}} period(s)',
                          active: activeCount,
                          total: chips.length,
                        })}
                      </span>
                    </button>
                    {isExpanded && chips.map(pp => {
                      const baseCls = pp.active
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-slate-50 text-slate-400 line-through';
                      return (
                        <span
                          key={pp.id}
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${baseCls}`}
                        >
                          {pp.periodName || `#${pp.periodId}`}
                        </span>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </li>
    );
  };

  return (
    <ul className="flex flex-col gap-2">
      {groups.map(g => renderGroup(g))}
    </ul>
  );
}
