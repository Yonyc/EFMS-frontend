import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiDelete, apiGet, apiPost, apiPut } from "~/utils/api";
import { PaginationBar } from "~/components/PaginationBar";
import { CircleStackIcon } from "@heroicons/react/24/outline";

interface UnitItem { id: number; value: string; farmId?: number | null }
interface ProductTypeItem { id: number; name: string; unitId?: number | null; farmId?: number | null }
interface OpTypeItem { id: number; name: string; farmId?: number | null }
interface CategoryItem { id: number; name: string }

interface EditState { id: number; value: string; extra?: string }

const PAGE_SIZE = 15;

function SectionCard({ title, description, addForm, filterBar, footer, children }: {
  title: string;
  description?: string;
  addForm: React.ReactNode;
  filterBar?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/20">
      <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-800">
        <div className="p-2.5 bg-indigo-500/10 rounded-xl">
          <CircleStackIcon className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-100">{title}</h3>
          {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="mb-4 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
        {addForm}
      </div>
      {filterBar && <div className="mb-3">{filterBar}</div>}
      <ul className="divide-y divide-slate-800">{children}</ul>
      {footer}
    </div>
  );
}

const inputCls = "rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none disabled:opacity-50";
const btnPrimary = "rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50";
const btnGhost = "text-xs font-semibold text-slate-400 hover:text-slate-200 disabled:opacity-50";
const btnDanger = "text-xs font-semibold text-rose-400 hover:text-rose-300 disabled:opacity-50";
const btnSave = "text-xs font-semibold text-indigo-400 hover:text-indigo-300 disabled:opacity-50";
const searchCls = "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none";

export default function AdminReference() {
  const { t } = useTranslation();

  const [units, setUnits] = useState<UnitItem[]>([]);
  const [productTypes, setProductTypes] = useState<ProductTypeItem[]>([]);
  const [opTypes, setOpTypes] = useState<OpTypeItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add form state
  const [newUnit, setNewUnit] = useState("");
  const [newPtName, setNewPtName] = useState("");
  const [newPtUnitId, setNewPtUnitId] = useState("");
  const [newOpType, setNewOpType] = useState("");
  const [newCategory, setNewCategory] = useState("");

  // Inline edit state (one section active at a time)
  const [editUnit, setEditUnit] = useState<EditState | null>(null);
  const [editPt, setEditPt] = useState<EditState | null>(null);
  const [editOpType, setEditOpType] = useState<EditState | null>(null);
  const [editCategory, setEditCategory] = useState<EditState | null>(null);

  // Search state
  const [unitSearch, setUnitSearch] = useState("");
  const [ptSearch, setPtSearch] = useState("");
  const [opTypeSearch, setOpTypeSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");

  // Page state
  const [unitPage, setUnitPage] = useState(0);
  const [ptPage, setPtPage] = useState(0);
  const [opTypePage, setOpTypePage] = useState(0);
  const [categoryPage, setCategoryPage] = useState(0);

  const editUnitRef = useRef<HTMLInputElement>(null);
  const editPtRef = useRef<HTMLInputElement>(null);
  const editOpTypeRef = useRef<HTMLInputElement>(null);
  const editCategoryRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [uRes, ptRes, otRes, catRes] = await Promise.all([
        apiGet("/units"),
        apiGet("/product-types"),
        apiGet("/operations/types"),
        apiGet("/tool-categories"),
      ]);
      if (uRes.ok) setUnits(await uRes.json());
      if (ptRes.ok) setProductTypes(await ptRes.json());
      if (otRes.ok) setOpTypes(await otRes.json());
      if (catRes.ok) setCategories(await catRes.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const withSave = async (fn: () => Promise<void>) => {
    setSaving(true);
    try { await fn(); await load(); }
    catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  // ── Units ──
  const addUnit = () => withSave(async () => {
    if (!newUnit.trim()) return;
    await apiPost("/units", { value: newUnit.trim() });
    setNewUnit("");
  });
  const saveUnit = (id: number, value: string) => withSave(async () => {
    await apiPut(`/units/${id}`, { value });
    setEditUnit(null);
  });
  const deleteUnit = (id: number) => withSave(() => apiDelete(`/units/${id}`).then(() => {}));

  // ── Product types ──
  const addPt = () => withSave(async () => {
    if (!newPtName.trim()) return;
    await apiPost("/product-types", { name: newPtName.trim(), unitId: newPtUnitId ? Number(newPtUnitId) : null });
    setNewPtName(""); setNewPtUnitId("");
  });
  const savePt = (id: number, name: string, unitId: string) => withSave(async () => {
    await apiPut(`/product-types/${id}`, { name, unitId: unitId ? Number(unitId) : null });
    setEditPt(null);
  });
  const deletePt = (id: number) => withSave(() => apiDelete(`/product-types/${id}`).then(() => {}));

  // ── Operation types ──
  const addOpType = () => withSave(async () => {
    if (!newOpType.trim()) return;
    await apiPost("/operations/types", { name: newOpType.trim() });
    setNewOpType("");
  });
  const saveOpType = (id: number, name: string) => withSave(async () => {
    await apiPut(`/operations/types/${id}`, { name });
    setEditOpType(null);
  });
  const deleteOpType = (id: number) => withSave(() => apiDelete(`/operations/types/${id}`).then(() => {}));

  // ── Tool categories ──
  const addCategory = () => withSave(async () => {
    if (!newCategory.trim()) return;
    await apiPost("/tool-categories", { name: newCategory.trim() });
    setNewCategory("");
  });
  const saveCategory = (id: number, name: string) => withSave(async () => {
    await apiPut(`/tool-categories/${id}`, { name });
    setEditCategory(null);
  });
  const deleteCategory = (id: number) => withSave(() => apiDelete(`/tool-categories/${id}`).then(() => {}));

  const unitLookup = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  // Filtered + paginated lists
  const filteredUnits = useMemo(() =>
    units.filter((u) => !unitSearch.trim() || u.value.toLowerCase().includes(unitSearch.trim().toLowerCase())),
    [units, unitSearch]);

  const filteredPt = useMemo(() =>
    productTypes.filter((pt) => !ptSearch.trim() || pt.name.toLowerCase().includes(ptSearch.trim().toLowerCase())),
    [productTypes, ptSearch]);

  const globalOpTypes = useMemo(() => opTypes.filter((ot) => !ot.farmId), [opTypes]);
  const filteredOpTypes = useMemo(() =>
    globalOpTypes.filter((ot) => !opTypeSearch.trim() || ot.name.toLowerCase().includes(opTypeSearch.trim().toLowerCase())),
    [globalOpTypes, opTypeSearch]);

  const filteredCategories = useMemo(() =>
    categories.filter((c) => !categorySearch.trim() || c.name.toLowerCase().includes(categorySearch.trim().toLowerCase())),
    [categories, categorySearch]);

  const paginate = <T,>(items: T[], page: number) => items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = (count: number) => Math.ceil(count / PAGE_SIZE);

  const pagedUnits = paginate(filteredUnits, unitPage);
  const pagedPt = paginate(filteredPt, ptPage);
  const pagedOpTypes = paginate(filteredOpTypes, opTypePage);
  const pagedCategories = paginate(filteredCategories, categoryPage);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        {t("common.loading", { defaultValue: "Loading..." })}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="mb-8">
        <h2 className="text-2xl font-extrabold text-slate-100">
          {t("admin.reference.title", { defaultValue: "Global Reference Data" })}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          {t("admin.reference.subtitle", { defaultValue: "Manage the global catalog items available to all farms." })}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">

        {/* ── Units ── */}
        <SectionCard
          title={t("admin.reference.units.title", { defaultValue: "Units" })}
          description={t("admin.reference.units.desc", { defaultValue: "Measurement units used on products." })}
          addForm={
            <div className="flex gap-2">
              <input
                className={`flex-1 ${inputCls}`}
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addUnit(); }}
                placeholder={t("admin.reference.units.placeholder", { defaultValue: "e.g. kg, L, seeds/m²" })}
                disabled={saving}
              />
              <button type="button" onClick={addUnit} disabled={saving || !newUnit.trim()} className={btnPrimary}>
                {t("common.add", { defaultValue: "Add" })}
              </button>
            </div>
          }
          filterBar={
            <input
              className={searchCls}
              value={unitSearch}
              onChange={(e) => { setUnitSearch(e.target.value); setUnitPage(0); }}
              placeholder={t("common.search", { defaultValue: "Search…" })}
            />
          }
          footer={
            <PaginationBar
              page={unitPage}
              totalPages={totalPages(filteredUnits.length)}
              onPrev={() => setUnitPage((p) => Math.max(0, p - 1))}
              onNext={() => setUnitPage((p) => Math.min(totalPages(filteredUnits.length) - 1, p + 1))}
            />
          }
        >
          {pagedUnits.map((u) => (
            <li key={u.id} className="py-2.5">
              {editUnit?.id === u.id ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={editUnitRef}
                    autoFocus
                    className={`flex-1 ${inputCls}`}
                    value={editUnit.value}
                    onChange={(e) => setEditUnit({ ...editUnit, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveUnit(u.id, editUnit.value);
                      if (e.key === "Escape") setEditUnit(null);
                    }}
                    disabled={saving}
                  />
                  <button type="button" onClick={() => saveUnit(u.id, editUnit.value)} disabled={saving || !editUnit.value.trim()} className={btnSave}>
                    {t("common.save", { defaultValue: "Save" })}
                  </button>
                  <button type="button" onClick={() => setEditUnit(null)} disabled={saving} className={btnGhost}>
                    {t("common.cancel", { defaultValue: "Cancel" })}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-200">{u.value}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <button type="button" onClick={() => setEditUnit({ id: u.id, value: u.value })} disabled={saving} className={btnGhost}>
                      {t("common.rename", { defaultValue: "Rename" })}
                    </button>
                    <button type="button" onClick={() => deleteUnit(u.id)} disabled={saving} className={btnDanger}>
                      {t("common.delete", { defaultValue: "Delete" })}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {!pagedUnits.length && (
            <li className="py-3 text-sm text-slate-500">
              {unitSearch ? t("common.noResults", { defaultValue: "No results." }) : t("admin.reference.units.empty", { defaultValue: "No global units." })}
            </li>
          )}
        </SectionCard>

        {/* ── Product types ── */}
        <SectionCard
          title={t("admin.reference.productTypes.title", { defaultValue: "Product types" })}
          description={t("admin.reference.productTypes.desc", { defaultValue: "Categories for farm products." })}
          addForm={
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  className={`flex-1 ${inputCls}`}
                  value={newPtName}
                  onChange={(e) => setNewPtName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addPt(); }}
                  placeholder={t("admin.reference.productTypes.placeholder", { defaultValue: "e.g. Herbicide" })}
                  disabled={saving}
                />
                <button type="button" onClick={addPt} disabled={saving || !newPtName.trim()} className={btnPrimary}>
                  {t("common.add", { defaultValue: "Add" })}
                </button>
              </div>
              <select
                value={newPtUnitId}
                onChange={(e) => setNewPtUnitId(e.target.value)}
                disabled={saving}
                className={`w-full ${inputCls}`}
              >
                <option value="">{t("admin.reference.productTypes.noUnit", { defaultValue: "No default unit" })}</option>
                {units.map((u) => <option key={u.id} value={String(u.id)}>{u.value}</option>)}
              </select>
            </div>
          }
          filterBar={
            <input
              className={searchCls}
              value={ptSearch}
              onChange={(e) => { setPtSearch(e.target.value); setPtPage(0); }}
              placeholder={t("common.search", { defaultValue: "Search…" })}
            />
          }
          footer={
            <PaginationBar
              page={ptPage}
              totalPages={totalPages(filteredPt.length)}
              onPrev={() => setPtPage((p) => Math.max(0, p - 1))}
              onNext={() => setPtPage((p) => Math.min(totalPages(filteredPt.length) - 1, p + 1))}
            />
          }
        >
          {pagedPt.map((pt) => (
            <li key={pt.id} className="py-2.5">
              {editPt?.id === pt.id ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      ref={editPtRef}
                      autoFocus
                      className={`flex-1 ${inputCls}`}
                      value={editPt.value}
                      onChange={(e) => setEditPt({ ...editPt, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") savePt(pt.id, editPt.value, editPt.extra ?? "");
                        if (e.key === "Escape") setEditPt(null);
                      }}
                      disabled={saving}
                    />
                    <button type="button" onClick={() => savePt(pt.id, editPt.value, editPt.extra ?? "")} disabled={saving || !editPt.value.trim()} className={btnSave}>
                      {t("common.save", { defaultValue: "Save" })}
                    </button>
                    <button type="button" onClick={() => setEditPt(null)} disabled={saving} className={btnGhost}>
                      {t("common.cancel", { defaultValue: "Cancel" })}
                    </button>
                  </div>
                  <select
                    value={editPt.extra ?? ""}
                    onChange={(e) => setEditPt({ ...editPt, extra: e.target.value })}
                    disabled={saving}
                    className={`w-full ${inputCls}`}
                  >
                    <option value="">{t("admin.reference.productTypes.noUnit", { defaultValue: "No default unit" })}</option>
                    {units.map((u) => <option key={u.id} value={String(u.id)}>{u.value}</option>)}
                  </select>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-slate-200">{pt.name}</span>
                    {pt.unitId && (
                      <span className="ml-2 text-xs text-slate-500">({unitLookup.get(pt.unitId)?.value})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button type="button"
                      onClick={() => setEditPt({ id: pt.id, value: pt.name, extra: pt.unitId ? String(pt.unitId) : "" })}
                      disabled={saving} className={btnGhost}>
                      {t("common.edit", { defaultValue: "Edit" })}
                    </button>
                    <button type="button" onClick={() => deletePt(pt.id)} disabled={saving} className={btnDanger}>
                      {t("common.delete", { defaultValue: "Delete" })}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {!pagedPt.length && (
            <li className="py-3 text-sm text-slate-500">
              {ptSearch ? t("common.noResults", { defaultValue: "No results." }) : t("admin.reference.productTypes.empty", { defaultValue: "No global product types." })}
            </li>
          )}
        </SectionCard>

        {/* ── Operation types ── */}
        <SectionCard
          title={t("admin.reference.opTypes.title", { defaultValue: "Operation types" })}
          description={t("admin.reference.opTypes.desc", { defaultValue: "Types of farm operations (spraying, seeding…)." })}
          addForm={
            <div className="flex gap-2">
              <input
                className={`flex-1 ${inputCls}`}
                value={newOpType}
                onChange={(e) => setNewOpType(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addOpType(); }}
                placeholder={t("admin.reference.opTypes.placeholder", { defaultValue: "e.g. Spraying" })}
                disabled={saving}
              />
              <button type="button" onClick={addOpType} disabled={saving || !newOpType.trim()} className={btnPrimary}>
                {t("common.add", { defaultValue: "Add" })}
              </button>
            </div>
          }
          filterBar={
            <input
              className={searchCls}
              value={opTypeSearch}
              onChange={(e) => { setOpTypeSearch(e.target.value); setOpTypePage(0); }}
              placeholder={t("common.search", { defaultValue: "Search…" })}
            />
          }
          footer={
            <PaginationBar
              page={opTypePage}
              totalPages={totalPages(filteredOpTypes.length)}
              onPrev={() => setOpTypePage((p) => Math.max(0, p - 1))}
              onNext={() => setOpTypePage((p) => Math.min(totalPages(filteredOpTypes.length) - 1, p + 1))}
            />
          }
        >
          {pagedOpTypes.map((ot) => (
            <li key={ot.id} className="py-2.5">
              {editOpType?.id === ot.id ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={editOpTypeRef}
                    autoFocus
                    className={`flex-1 ${inputCls}`}
                    value={editOpType.value}
                    onChange={(e) => setEditOpType({ ...editOpType, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveOpType(ot.id, editOpType.value);
                      if (e.key === "Escape") setEditOpType(null);
                    }}
                    disabled={saving}
                  />
                  <button type="button" onClick={() => saveOpType(ot.id, editOpType.value)} disabled={saving || !editOpType.value.trim()} className={btnSave}>
                    {t("common.save", { defaultValue: "Save" })}
                  </button>
                  <button type="button" onClick={() => setEditOpType(null)} disabled={saving} className={btnGhost}>
                    {t("common.cancel", { defaultValue: "Cancel" })}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-200">{ot.name}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <button type="button" onClick={() => setEditOpType({ id: ot.id, value: ot.name })} disabled={saving} className={btnGhost}>
                      {t("common.rename", { defaultValue: "Rename" })}
                    </button>
                    <button type="button" onClick={() => deleteOpType(ot.id)} disabled={saving} className={btnDanger}>
                      {t("common.delete", { defaultValue: "Delete" })}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {!pagedOpTypes.length && (
            <li className="py-3 text-sm text-slate-500">
              {opTypeSearch ? t("common.noResults", { defaultValue: "No results." }) : t("admin.reference.opTypes.empty", { defaultValue: "No global operation types." })}
            </li>
          )}
        </SectionCard>

        {/* ── Tool categories ── */}
        <SectionCard
          title={t("admin.reference.toolCategories.title", { defaultValue: "Tool categories" })}
          description={t("admin.reference.toolCategories.desc", { defaultValue: "Categories for farm tools and equipment." })}
          addForm={
            <div className="flex gap-2">
              <input
                className={`flex-1 ${inputCls}`}
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }}
                placeholder={t("admin.reference.toolCategories.placeholder", { defaultValue: "e.g. Sprayer, Tractor" })}
                disabled={saving}
              />
              <button type="button" onClick={addCategory} disabled={saving || !newCategory.trim()} className={btnPrimary}>
                {t("common.add", { defaultValue: "Add" })}
              </button>
            </div>
          }
          filterBar={
            <input
              className={searchCls}
              value={categorySearch}
              onChange={(e) => { setCategorySearch(e.target.value); setCategoryPage(0); }}
              placeholder={t("common.search", { defaultValue: "Search…" })}
            />
          }
          footer={
            <PaginationBar
              page={categoryPage}
              totalPages={totalPages(filteredCategories.length)}
              onPrev={() => setCategoryPage((p) => Math.max(0, p - 1))}
              onNext={() => setCategoryPage((p) => Math.min(totalPages(filteredCategories.length) - 1, p + 1))}
            />
          }
        >
          {pagedCategories.map((c) => (
            <li key={c.id} className="py-2.5">
              {editCategory?.id === c.id ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={editCategoryRef}
                    autoFocus
                    className={`flex-1 ${inputCls}`}
                    value={editCategory.value}
                    onChange={(e) => setEditCategory({ ...editCategory, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveCategory(c.id, editCategory.value);
                      if (e.key === "Escape") setEditCategory(null);
                    }}
                    disabled={saving}
                  />
                  <button type="button" onClick={() => saveCategory(c.id, editCategory.value)} disabled={saving || !editCategory.value.trim()} className={btnSave}>
                    {t("common.save", { defaultValue: "Save" })}
                  </button>
                  <button type="button" onClick={() => setEditCategory(null)} disabled={saving} className={btnGhost}>
                    {t("common.cancel", { defaultValue: "Cancel" })}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-200">{c.name}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <button type="button" onClick={() => setEditCategory({ id: c.id, value: c.name })} disabled={saving} className={btnGhost}>
                      {t("common.rename", { defaultValue: "Rename" })}
                    </button>
                    <button type="button" onClick={() => deleteCategory(c.id)} disabled={saving} className={btnDanger}>
                      {t("common.delete", { defaultValue: "Delete" })}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {!pagedCategories.length && (
            <li className="py-3 text-sm text-slate-500">
              {categorySearch ? t("common.noResults", { defaultValue: "No results." }) : t("admin.reference.toolCategories.empty", { defaultValue: "No tool categories." })}
            </li>
          )}
        </SectionCard>

      </div>
    </div>
  );
}
