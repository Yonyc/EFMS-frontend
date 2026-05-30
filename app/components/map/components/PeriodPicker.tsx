import { useTranslation } from 'react-i18next';
import type { PeriodDto } from '../types';

interface PeriodPickerProps {
    periods: PeriodDto[];
    
    value: string;
    onChange: (next: string) => void;
    
    includeAll?: boolean;
    
    label?: string;
    className?: string;
    disabled?: boolean;
    
    size?: 'default' | 'compact';
}

/**
 * Single-period dropdown reused by the main map filter, the import preview map,
 * and the per-parcel period switcher in the polygon popup. When {@code includeAll}
 * is true, an empty-string value means "no filter / show all periods".
 *
 * Periods are sorted descending by startDate (most recent first) so the default
 * pick is the most recent campaign.
 */
export function PeriodPicker({
    periods, value, onChange, includeAll = true, label, className, disabled, size = 'default',
}: PeriodPickerProps) {
    const { t } = useTranslation();
    const sorted = [...periods].sort((a, b) => {
        const da = a.startDate ? new Date(a.startDate).getTime() : 0;
        const db = b.startDate ? new Date(b.startDate).getTime() : 0;
        return db - da;
    });
    const base = size === 'compact'
        ? 'text-xs px-2 py-1 rounded-full border border-slate-300 bg-white'
        : 'text-sm px-3 py-2 rounded-md border border-slate-300 bg-white';
    return (
        <label className={className ?? ''}>
            {label && <span className="block mb-1 text-xs font-medium text-slate-700">{label}</span>}
            <select
                className={`${base} disabled:opacity-50`}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
            >
                {includeAll && <option value="">{t('map.periodPicker.showAll', { defaultValue: 'All periods' })}</option>}
                {sorted.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                        {p.name || `#${p.id}`}
                    </option>
                ))}
            </select>
        </label>
    );
}
