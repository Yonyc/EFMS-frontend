import React from "react";
import type { PeriodDto, PolygonData, ParcelShareDto } from "../types";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface MapModalsProps {
    t: any;
    // rename modal
    renamingId: string | null;
    setRenamingId: (val: string | null) => void;
    renameValue: string;
    setRenameValue: (val: string) => void;
    renamePeriodId: string;
    setRenamePeriodId: (val: string) => void;
    handleRenameConfirm: (force?: boolean, allowAnyway?: boolean) => Promise<void>;
    periods: PeriodDto[];
    // area modal
    isAreaModalOpen: boolean;
    areaName: string;
    setAreaName: (val: string) => void;
    selectedPeriodId: string;
    setSelectedPeriodId: (val: string) => void;
    handleAreaConfirm: (force?: boolean, allowOverlap?: boolean) => void;
    handleAreaCancel: () => void;
    // share modal
    shareParcelId: string | null;
    setShareParcelId: (val: string | null) => void;
    shareList: ParcelShareDto[];
    shareUsername: string;
    setShareUsername: (val: string) => void;
    shareRole: string;
    setShareRole: (val: string) => void;
    shareError: string;
    shareLoading: boolean;
    handleAddShare: () => Promise<void>;
    handleUpdateShare: (userId: number, role: string) => Promise<void>;
    handleRemoveShare: (userId: number) => Promise<void>;
    allPolygons: PolygonData[];
}

const MapModals = React.memo((props: MapModalsProps) => {
    const {
        t,
        renamingId, setRenamingId, renameValue, setRenameValue, renamePeriodId, setRenamePeriodId, handleRenameConfirm, periods,
        isAreaModalOpen, areaName, setAreaName, selectedPeriodId, setSelectedPeriodId, handleAreaConfirm, handleAreaCancel,
        shareParcelId, setShareParcelId, shareList, shareUsername, setShareUsername, shareRole, setShareRole, shareError, shareLoading,
        handleAddShare, handleUpdateShare, handleRemoveShare, allPolygons
    } = props;

    return (
        <>
            {/* Rename Modal */}
            {renamingId && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10001 }}>
                    <div style={{ background: "#fff", padding: "2rem", borderRadius: 8, boxShadow: "0 4px 24px rgba(0,0,0,0.3)", minWidth: 400, display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                        <h2 style={{ margin: 0, color: '#222', fontSize: "1.5rem" }}>{t('map.renameModal.title')}</h2>
                        <input type="text" value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={async e => {
                            if (e.key === "Enter") handleRenameConfirm(true);
                        }} placeholder={t('map.renameModal.placeholder')} style={{ padding: "0.75rem", fontSize: "1rem", borderRadius: 4, border: "1px solid #ccc", color: "#222" }} autoFocus />
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.95rem", color: "#333" }}>
                            {t('map.areaModal.periodLabel', { defaultValue: 'Period' })}
                            <select
                                value={renamePeriodId}
                                onChange={(e) => setRenamePeriodId(e.target.value)}
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
                            <button onClick={() => { setRenamingId(null); setRenamePeriodId(""); }} style={{ padding: "0.75rem 1.5rem", borderRadius: 4, border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontWeight: 500, color: "#333" }}>{t('common.cancel', { defaultValue: 'Cancel' })}</button>
                            <button onClick={() => handleRenameConfirm(true)} style={{ padding: "0.75rem 1.5rem", borderRadius: 4, border: "none", background: "#007bff", color: "#fff", cursor: "pointer", fontWeight: 500 }}>
                                {t('common.confirm', { defaultValue: 'Confirm' })}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Area Modal */}
            {isAreaModalOpen && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10001 }}>
                    <div style={{ background: "#fff", padding: "2rem", borderRadius: 8, boxShadow: "0 4px 24px rgba(0,0,0,0.3)", maxWidth: 500, width: "100%", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                        <h2 style={{ margin: 0, color: '#222', fontSize: "1.5rem" }}>{t('map.areaModal.title')}</h2>
                        <input type="text" value={areaName} onChange={e => setAreaName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAreaConfirm(true)} placeholder={t('map.areaModal.placeholder')} style={{ padding: "0.75rem", fontSize: "1rem", borderRadius: 4, border: "1px solid #ccc", color: "#222" }} autoFocus />
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.95rem", color: "#333" }}>
                            {t('map.areaModal.periodLabel', { defaultValue: 'Period' })}
                            <select
                                value={selectedPeriodId}
                                onChange={(e) => setSelectedPeriodId(e.target.value)}
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
                            <button onClick={handleAreaCancel} style={{ padding: "0.75rem 1.5rem", borderRadius: 4, border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontWeight: 500, color: "#333" }}>{t('common.cancel')}</button>
                            <button 
                                onClick={() => handleAreaConfirm(true)} 
                                style={{ padding: "0.75rem 1.5rem", borderRadius: 4, border: "none", background: "#007bff", color: "#fff", cursor: "pointer", fontWeight: 500 }}
                            >
                                {t('common.confirm')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Share Modal */}
            {shareParcelId && (
                <div className="fixed inset-0 z-[110000] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setShareParcelId(null)} />
                    <div className="relative w-full max-w-[32rem] overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/50">
                        <div className="border-b border-white/5 bg-white/5 p-6 sm:p-8">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold tracking-tight text-white">{t('map.sharing.title', { defaultValue: 'Share access' })}</h2>
                                    <p className="mt-1 text-sm text-slate-400">
                                        {t('map.sharing.subtitle', { name: allPolygons.find(p => p.id === shareParcelId)?.name || t('map.unnamedParcel') })}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShareParcelId(null)}
                                    className="rounded-xl p-2 text-slate-400 hover:bg-white/5 hover:text-white"
                                >
                                    <XMarkIcon className="h-6 w-6" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 sm:p-8">
                            {shareError && (
                                <div className="mb-6 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
                                    {shareError}
                                </div>
                            )}

                            <div className="flex flex-col gap-4 sm:flex-row">
                                <div className="flex-1">
                                    <input
                                        type="text"
                                        placeholder={t('map.sharing.usernamePlaceholder', { defaultValue: 'Username' })}
                                        value={shareUsername}
                                        onChange={(e) => setShareUsername(e.target.value)}
                                        className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-white outline-none focus:border-indigo-500"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <select
                                        value={shareRole}
                                        onChange={(e) => setShareRole(e.target.value)}
                                        className="h-12 rounded-2xl border border-white/10 bg-white/5 px-4 text-white outline-none focus:border-indigo-500"
                                    >
                                        <option value="VIEWER">Viewer</option>
                                        <option value="EDITOR">Editor</option>
                                        <option value="OWNER">Owner</option>
                                    </select>
                                    <button
                                        onClick={handleAddShare}
                                        className="h-12 rounded-2xl bg-indigo-600 px-6 font-bold text-white transition hover:bg-indigo-500"
                                    >
                                        {t('common.add', { defaultValue: 'Add' })}
                                    </button>
                                </div>
                            </div>

                            <div className="mt-8">
                                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('map.sharing.currentShares', { defaultValue: 'People with access' })}</h3>
                                <div className="mt-4 flex max-h-64 flex-col gap-3 overflow-y-auto pr-2">
                                    {shareLoading && (
                                        <div className="py-8 text-center text-slate-500">Loading...</div>
                                    )}
                                    {!shareLoading && shareList.length === 0 && (
                                        <div className="py-8 text-center text-slate-500">{t('map.sharing.noShares', { defaultValue: 'Not shared with anyone yet' })}</div>
                                    )}
                                    {shareList.map(share => (
                                        <div key={share.userId} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2">
                                            <div className="flex-1">
                                                <p className="text-sm font-semibold text-white">{share.username}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <select
                                                    value={share.role}
                                                    onChange={(event) => handleUpdateShare(share.userId, event.target.value)}
                                                    className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white outline-none focus:border-indigo-500"
                                                >
                                                    <option value="VIEWER">Viewer</option>
                                                    <option value="EDITOR">Editor</option>
                                                    <option value="OWNER">Owner</option>
                                                </select>
                                                <button
                                                    onClick={() => handleRemoveShare(share.userId)}
                                                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"
                                                >
                                                    <XMarkIcon className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
});

export default MapModals;
