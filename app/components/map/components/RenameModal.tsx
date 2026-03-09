import { useTranslation } from "react-i18next";
import { apiPut } from "~/utils/api";
import type { PolygonData, PeriodDto } from "../types";

interface RenameModalProps {
    renamingId: string;
    setRenamingId: React.Dispatch<React.SetStateAction<string | null>>;
    renameValue: string;
    setRenameValue: React.Dispatch<React.SetStateAction<string>>;
    renamePeriodId: string;
    setRenamePeriodId: React.Dispatch<React.SetStateAction<string>>;
    periods: PeriodDto[];
    parcelsEndpoint: string;
    setPolygons: React.Dispatch<React.SetStateAction<PolygonData[]>>;
}

export function RenameModal({
    renamingId,
    setRenamingId,
    renameValue,
    setRenameValue,
    renamePeriodId,
    setRenamePeriodId,
    periods,
    parcelsEndpoint,
    setPolygons,
}: RenameModalProps) {
    const { t } = useTranslation();

    const doRename = async () => {
        setPolygons(prev => prev.map(p =>
            p.id === renamingId ? { ...p, name: renameValue, periodId: renamePeriodId ? Number(renamePeriodId) : null } : p
        ));
        try {
            const payload = { name: renameValue, periodId: renamePeriodId ? Number(renamePeriodId) : null };
            const response = await apiPut(`${parcelsEndpoint}/${renamingId}`, payload);
            if (!response.ok) console.error("Failed to update parcel name:", response.statusText);
        } catch (err) {
            console.error("Failed to update parcel name:", err);
        }
        setRenamingId(null);
        setRenamePeriodId("");
    };

    const close = () => {
        setRenamingId(null);
        setRenamePeriodId("");
    };

    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10001 }}>
            <div style={{ background: "#fff", padding: "2rem", borderRadius: 8, boxShadow: "0 4px 24px rgba(0,0,0,0.3)", minWidth: 400, display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <h2 style={{ margin: 0, color: '#222', fontSize: "1.5rem" }}>{t('map.renameModal.title')}</h2>
                <input
                    type="text"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={async e => {
                        if (e.key === "Enter") await doRename();
                        else if (e.key === "Escape") close();
                    }}
                    placeholder={t('map.renameModal.placeholder')}
                    style={{ padding: "0.75rem", fontSize: "1rem", borderRadius: 4, border: "1px solid #ccc", color: "#222" }}
                    autoFocus
                />
                <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.95rem", color: "#333" }}>
                    {t('map.renameModal.periodLabel', { defaultValue: 'Period' })}
                    <select
                        value={renamePeriodId}
                        onChange={e => setRenamePeriodId(e.target.value)}
                        style={{ padding: "0.7rem", fontSize: "1rem", borderRadius: 4, border: "1px solid #ccc", color: "#222" }}
                    >
                        <option value="">{t('map.renameModal.periodPlaceholder', { defaultValue: 'No period' })}</option>
                        {periods.map(period => (
                            <option key={period.id} value={String(period.id)}>
                                {period.name || `${period.startDate || ''} - ${period.endDate || ''}`}
                            </option>
                        ))}
                    </select>
                </label>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", paddingTop: "1rem", borderTop: "1px solid #eee" }}>
                    <button onClick={close} style={{ padding: "0.75rem 1.5rem", borderRadius: 4, border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontWeight: 500, color: "#333" }}>
                        {t('common.cancel', { defaultValue: 'Cancel' })}
                    </button>
                    <button onClick={doRename} style={{ padding: "0.75rem 1.5rem", borderRadius: 4, border: "none", background: "#007bff", color: "#fff", cursor: "pointer", fontWeight: 500 }}>
                        {t('common.confirm', { defaultValue: 'Confirm' })}
                    </button>
                </div>
            </div>
        </div>
    );
}
