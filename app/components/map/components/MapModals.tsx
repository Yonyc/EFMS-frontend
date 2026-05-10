import React from "react";
import type { PeriodDto, PolygonData, ParcelShareDto } from "../types";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { createPortal } from "react-dom";
import MultiSelectCombobox from "../../MultiSelectCombobox";
import type { ToolDto, ProductDto } from "../types";

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
    sharing: any;
    allPolygons: PolygonData[];
    tools: ToolDto[];
    products: ProductDto[];
}

const MapModals = React.memo((props: MapModalsProps) => {
    const {
        t,
        renamingId, setRenamingId, renameValue, setRenameValue, renamePeriodId, setRenamePeriodId, handleRenameConfirm, periods,
        isAreaModalOpen, areaName, setAreaName, selectedPeriodId, setSelectedPeriodId, handleAreaConfirm, handleAreaCancel,
        sharing, tools, products, allPolygons
    } = props;

    const {
        shareParcelId, closeShareModal, shareList, shareUsername, setShareUsername, shareRole, setShareRole, shareError, shareLoading,
        handleAddShare, handleUpdateShare, handleRemoveShare,
        researchShares, setResearchShares, researchShareUsername, setResearchShareUsername, researchSharePeriodIds, setResearchSharePeriodIds,
        researchShareToolIds, setResearchShareToolIds, researchShareProductIds, setResearchShareProductIds, researchShareFilterStartDate,
        setResearchShareFilterStartDate, researchShareFilterEndDate, setResearchShareFilterEndDate, researchShareStartAt, setResearchShareStartAt,
        researchShareEndAt, setResearchShareEndAt, researchShareMode, setResearchShareMode, researchShareMaxUsers, setResearchShareMaxUsers,
        researchShareFeedback, setResearchShareFeedback, researchShareLastLink, researchShareLoading, quickShareLink, quickShareFeedback, setQuickShareFeedback,
        filterShareModalOpen, setFilterShareModalOpen, filterShareZoneWkt, setFilterShareZoneWkt, loadResearchShares, handleCreateResearchShare,
        handleRemoveResearchShare, handleQuickShareCurrentFilter, handleCreateFilterResearchShare
    } = sharing;


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
                    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={closeShareModal} />
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
                                    onClick={closeShareModal}
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
                                        <option value="VIEWER">{t('map.sharing.roles.viewer', { defaultValue: 'Viewer' })}</option>
                                        <option value="EDITOR">{t('map.sharing.roles.editor', { defaultValue: 'Editor' })}</option>
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
                                    {shareList.map((share: any) => (
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
                                                    <option value="VIEWER">{t('map.sharing.roles.viewer', { defaultValue: 'Viewer' })}</option>
                                                    <option value="EDITOR">{t('map.sharing.roles.editor', { defaultValue: 'Editor' })}</option>
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
{filterShareModalOpen && typeof document !== 'undefined' && createPortal((
                    <div className="pointer-events-auto fixed inset-0 z-[6500] flex items-center justify-center bg-slate-950/60 px-4">
                        <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl shadow-black/40">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-lg font-semibold text-white">Share Current Filter</h3>
                                    <p className="text-sm text-slate-300">
                                        Define permissions, user limits, and optional time window before generating the share.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFilterShareModalOpen(false);
                                        setFilterShareZoneWkt(null);
                                    }}
                                    className="rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                                    aria-label="Close"
                                >
                                    <XMarkIcon className="h-5 w-5" />
                                </button>
                            </div>

                            <form className="mt-4 grid gap-2" onSubmit={handleCreateFilterResearchShare}>
                                <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-slate-950/40 p-1">
                                    <button
                                        type="button"
                                        onClick={() => setResearchShareMode('direct')}
                                        className={`rounded-md px-3 py-2 text-xs font-semibold transition ${researchShareMode === 'direct' ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:bg-white/5'}`}
                                    >
                                        Share directly to user(s)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setResearchShareMode('link')}
                                        className={`rounded-md px-3 py-2 text-xs font-semibold transition ${researchShareMode === 'link' ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:bg-white/5'}`}
                                    >
                                        Create link with user limit
                                    </button>
                                </div>

                                {researchShareMode === 'direct' ? (
                                    <label className="text-xs text-slate-300">
                                        Usernames (comma or new line separated)
                                        <textarea
                                            value={researchShareUsername}
                                            onChange={(event) => setResearchShareUsername(event.target.value)}
                                            rows={3}
                                            placeholder="alice, bob"
                                            className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                                        />
                                    </label>
                                ) : (
                                    <label className="text-xs text-slate-300">
                                        Maximum number of users for this link
                                        <input
                                            type="number"
                                            min="1"
                                            value={researchShareMaxUsers}
                                            onChange={(event) => setResearchShareMaxUsers(event.target.value)}
                                            placeholder="Unlimited"
                                            className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                                        />
                                    </label>
                                )}

                                <div className="grid gap-2 sm:grid-cols-3">
                                    <MultiSelectCombobox
                                        label="Periods"
                                        options={periods.map(p => ({ value: String(p.id), label: p.name || `${p.startDate || ''} - ${p.endDate || ''}` }))}
                                        selectedValues={researchSharePeriodIds}
                                        onChange={setResearchSharePeriodIds}
                                        placeholder="Any period"
                                    />
                                    <MultiSelectCombobox
                                        label="Tools"
                                        options={tools.map(t => ({ value: String(t.id), label: t.name }))}
                                        selectedValues={researchShareToolIds}
                                        onChange={setResearchShareToolIds}
                                        placeholder="Any tool"
                                    />
                                    <MultiSelectCombobox
                                        label="Products"
                                        options={products.map(p => ({ value: String(p.id), label: p.name }))}
                                        selectedValues={researchShareProductIds}
                                        onChange={setResearchShareProductIds}
                                        placeholder="Any product"
                                    />
                                </div>

                                <div className="grid gap-2 sm:grid-cols-2">
                                    <label className="text-xs text-slate-300">
                                        Filter start date
                                        <input
                                            type="date"
                                            value={researchShareFilterStartDate}
                                            onChange={(event) => setResearchShareFilterStartDate(event.target.value)}
                                            className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-xs text-white focus:border-indigo-400 focus:outline-none"
                                        />
                                    </label>
                                    <label className="text-xs text-slate-300">
                                        Filter end date
                                        <input
                                            type="date"
                                            value={researchShareFilterEndDate}
                                            onChange={(event) => setResearchShareFilterEndDate(event.target.value)}
                                            className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-xs text-white focus:border-indigo-400 focus:outline-none"
                                        />
                                    </label>
                                </div>

                                <div className="grid gap-2 sm:grid-cols-2">
                                    <label className="text-xs text-slate-300">
                                        Share starts at
                                        <input
                                            type="datetime-local"
                                            value={researchShareStartAt}
                                            onChange={(event) => setResearchShareStartAt(event.target.value)}
                                            className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-xs text-white focus:border-indigo-400 focus:outline-none"
                                        />
                                    </label>
                                    <label className="text-xs text-slate-300">
                                        Share ends at
                                        <input
                                            type="datetime-local"
                                            value={researchShareEndAt}
                                            onChange={(event) => setResearchShareEndAt(event.target.value)}
                                            className="mt-1 w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-xs text-white focus:border-indigo-400 focus:outline-none"
                                        />
                                    </label>
                                </div>

                                <div className="mt-1 flex items-center justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFilterShareModalOpen(false);
                                            setFilterShareZoneWkt(null);
                                        }}
                                        className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={researchShareLoading}
                                        className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {researchShareLoading ? 'Creating...' : (researchShareMode === 'direct' ? 'Create Direct Share' : 'Create Limited Link')}
                                    </button>
                                </div>
                            </form>

                            {researchShareFeedback && (
                                <div className="mt-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100 break-all">
                                    {researchShareFeedback}
                                </div>
                            )}

                            {quickShareLink && (
                                <div className="mt-2 flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2">
                                    <p className="flex-1 text-xs text-indigo-100 break-all">{quickShareLink}</p>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            await navigator.clipboard.writeText(quickShareLink);
                                            const copied = true;
                                            setResearchShareFeedback(copied ? 'Link copied to clipboard.' : 'Unable to copy the link.');
                                        }}
                                        className="rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-2 py-1 text-xs font-semibold text-indigo-100 hover:bg-indigo-500/20"
                                    >
                                        Copy
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ), document.body)}
        </>
    );
});

export default MapModals;
