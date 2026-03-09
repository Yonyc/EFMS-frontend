import { useTranslation } from "react-i18next";
import type { PeriodDto } from "../types";

interface AreaNameModalProps {
    areaName: string;
    setAreaName: React.Dispatch<React.SetStateAction<string>>;
    selectedPeriodId: string;
    setSelectedPeriodId: React.Dispatch<React.SetStateAction<string>>;
    periods: PeriodDto[];
    onCancel: () => void;
    onConfirm: () => void;
}

export function AreaNameModal({
    areaName,
    setAreaName,
    selectedPeriodId,
    setSelectedPeriodId,
    periods,
    onCancel,
    onConfirm,
}: AreaNameModalProps) {
    const { t } = useTranslation();

    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10001 }}>
            <div style={{ background: "#fff", padding: "2rem", borderRadius: 8, boxShadow: "0 4px 24px rgba(0,0,0,0.3)", minWidth: 400, display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <h2 style={{ margin: 0, color: '#222', fontSize: "1.5rem" }}>{t('map.areaModal.title')}</h2>
                <input
                    type="text"
                    value={areaName}
                    onChange={e => setAreaName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && onConfirm()}
                    placeholder={t('map.areaModal.placeholder')}
                    style={{ padding: "0.75rem", fontSize: "1rem", borderRadius: 4, border: "1px solid #ccc", color: "#222" }}
                    autoFocus
                />
                <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.95rem", color: "#333" }}>
                    {t('map.areaModal.periodLabel', { defaultValue: 'Period' })}
                    <select
                        value={selectedPeriodId}
                        onChange={e => setSelectedPeriodId(e.target.value)}
                        style={{ padding: "0.7rem", fontSize: "1rem", borderRadius: 4, border: "1px solid #ccc", color: "#222" }}
                    >
                        <option value="">{t('map.areaModal.periodPlaceholder', { defaultValue: 'No period' })}</option>
                        {periods.map(period => (
                            <option key={period.id} value={String(period.id)}>
                                {period.name || `${period.startDate || ''} - ${period.endDate || ''}`}
                            </option>
                        ))}
                    </select>
                </label>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", paddingTop: "1rem", borderTop: "1px solid #eee" }}>
                    <button onClick={onCancel} style={{ padding: "0.75rem 1.5rem", borderRadius: 4, border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontWeight: 500, color: "#333" }}>
                        {t('common.cancel', { defaultValue: 'Cancel' })}
                    </button>
                    <button onClick={onConfirm} style={{ padding: "0.75rem 1.5rem", borderRadius: 4, border: "none", background: "#007bff", color: "#fff", cursor: "pointer", fontWeight: 500 }}>
                        {t('common.confirm', { defaultValue: 'Confirm' })}
                    </button>
                </div>
            </div>
        </div>
    );
}
