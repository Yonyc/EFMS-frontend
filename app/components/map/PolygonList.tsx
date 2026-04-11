import { useTranslation } from "react-i18next";

interface PolygonData {
  id: string;
  name: string;
  visible: boolean;
  color?: string;
  validationStatus?: string;
  convertedParcelId?: number | null;
  canEdit?: boolean;
  parentId?: string | null;
}

interface PolygonListProps {
  polygons: PolygonData[];
  onToggle: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onFocus?: (id: string) => void;
  onApproveSingle?: (id: string) => void;
  emptyLabel?: string;
  showStatus?: boolean;
}

export default function PolygonList({ polygons, onToggle, onRename, onFocus, onApproveSingle, emptyLabel, showStatus }: PolygonListProps) {
  const { t } = useTranslation();

  const MAX_VISUAL_DEPTH = 5;
  const INDENT_STEP_REM = 0.5;

  if (!polygons.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-center text-sm text-slate-500">
        {emptyLabel || t('map.polygonList.empty') || 'No polygons yet'}
      </div>
    );
  }

  const polygonIds = new Set(polygons.map((p) => p.id));
  const childrenByParent = new Map<string, PolygonData[]>();
  for (const poly of polygons) {
    if (!poly.parentId || !polygonIds.has(poly.parentId)) continue;
    const children = childrenByParent.get(poly.parentId);
    if (children) children.push(poly);
    else childrenByParent.set(poly.parentId, [poly]);
  }

  const renderParcel = (poly: PolygonData, depth: number = 0, ancestry: Set<string> = new Set()) => {
    // Guard against malformed cyclic parent relations.
    if (ancestry.has(poly.id)) return null;
    const nextAncestry = new Set(ancestry);
    nextAncestry.add(poly.id);

    const visualDepth = Math.min(depth, MAX_VISUAL_DEPTH);
    const indentRem = visualDepth * INDENT_STEP_REM;

    const color = poly.color || '#4f46e5';
    const status = (poly.validationStatus || '').toUpperCase();
    const isApproved = status === 'APPROVED' || status === 'CONVERTED';
    const canReapprove = status === 'APPROVED' && !poly.convertedParcelId;
    const canApprove = !isApproved || canReapprove;
    const children = childrenByParent.get(poly.id) || [];

    return (
      <li key={poly.id} className="flex flex-col gap-2" style={{ marginLeft: indentRem ? `${indentRem}rem` : undefined }}>
        <div
          className="group relative overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 p-3 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
          onContextMenu={onApproveSingle && canApprove ? (e) => { e.preventDefault(); onApproveSingle(poly.id); } : undefined}
        >
          <span
            className="pointer-events-none absolute inset-y-3 left-2.5 w-1 rounded-full opacity-70 transition group-hover:opacity-100"
            style={{ background: color }}
          />
          <div className="flex items-start gap-2 pl-4">
            <div className="flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full border border-white/70 shadow"
                  style={{ background: color }}
                  aria-hidden
                />
                <input
                  type="text"
                  value={poly.name}
                  onChange={(e) => poly.canEdit === false ? undefined : onRename(poly.id, e.target.value)}
                  disabled={poly.canEdit === false}
                  className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-2.5 py-1.5 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  placeholder={t('map.polygonList.placeholder') || 'Polygon name'}
                />
                {showStatus && poly.validationStatus && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {poly.validationStatus}
                  </span>
                )}
                {onApproveSingle && canApprove && (
                  <button
                    type="button"
                    onClick={() => onApproveSingle(poly.id)}
                    className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 transition hover:border-emerald-200 hover:bg-emerald-100"
                  >
                    {canReapprove ? t('imports.map.reapproveOne', { defaultValue: 'Re-approve' }) : t('imports.map.approveOne', { defaultValue: 'Approve' })}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                <button
                  type="button"
                  onClick={() => onToggle(poly.id)}
                  className={`rounded-full px-2 py-0.5 font-medium transition ${
                    poly.visible ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {poly.visible ? t('map.polygonList.visible') || 'Visible' : t('map.polygonList.hidden') || 'Hidden'}
                </button>
                {onFocus && (
                  <button
                    type="button"
                    onClick={() => onFocus(poly.id)}
                    className="sm:ml-auto rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700 transition hover:border-indigo-200 hover:bg-indigo-100"
                  >
                    {t('map.polygonList.center', { defaultValue: 'Focus' })}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        {children.length > 0 && (
          <ul className="flex flex-col gap-2">
            {children.map(child => renderParcel(child, depth + 1, nextAncestry))}
          </ul>
        )}
      </li>
    );
  };

  const rootParcels = polygons.filter((p) => !p.parentId || !polygonIds.has(p.parentId));

  return (
    <ul className="flex flex-col gap-2">
      {rootParcels.map(p => renderParcel(p))}
    </ul>
  );
}

