import { useTranslation } from "react-i18next";

interface PolygonListProps {
  polygons: { id: string; name: string; visible: boolean; color?: string }[];
  onToggle: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  emptyLabel?: string;
}

export default function PolygonList({ polygons, onToggle, onRename, emptyLabel }: PolygonListProps) {
  const { t } = useTranslation();

  if (!polygons.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-center text-sm text-slate-500">
        {emptyLabel || t('map.polygonList.empty') || 'No polygons yet'}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {polygons.map((poly, idx) => {
        const color = poly.color || '#4f46e5';
        return (
          <li
            key={poly.id}
            className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-xl"
          >
            <span
              className="pointer-events-none absolute inset-y-4 left-3 w-1 rounded-full opacity-70 transition group-hover:opacity-100"
              style={{ background: color }}
            />
            <label className="flex items-start gap-3 pl-4">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                checked={poly.visible}
                onChange={() => onToggle(poly.id)}
              />
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full border border-white/70 shadow"
                    style={{ background: color }}
                    aria-hidden
                  />
                  <input
                    type="text"
                    value={poly.name}
                    onChange={(e) => onRename(poly.id, e.target.value)}
                    className="w-full rounded-2xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                    placeholder={t('map.polygonList.placeholder') || 'Polygon name'}
                  />
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                    #{idx + 1}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      poly.visible ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {poly.visible ? t('map.polygonList.visible') || 'Visible on map' : t('map.polygonList.hidden') || 'Hidden on map'}
                  </span>
                  <span className="text-slate-400">•</span>
                  <span>{t('map.polygonList.helper', { defaultValue: 'Click name to rename' })}</span>
                </div>
              </div>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
