import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import ProductSheetModal, { type ProductSheetData } from "~/components/ProductSheetModal";
import ToolSheetModal, { type ToolSheetData } from "~/components/ToolSheetModal";
import ProtectedRoute from "~/components/ProtectedRoute";
import { useAuth } from "~/contexts/AuthContext";
import { useFarm } from "~/contexts/FarmContext";
import { useCurrentLocale } from "~/hooks/useCurrentLocale";
import { apiDelete, apiGet, apiPost, apiPut, getPageMeta } from "~/utils/api";
import { PaginationBar } from "~/components/PaginationBar";
import { buildLocalizedPath } from "~/utils/locale";
import PeriodsSection from "~/components/PeriodsSection";
import { CultureTypesManager } from "~/routes/culture-types";

interface ProductDto {
  id: number;
  name: string;
  productTypeId?: number | null;
  unitId?: number | null;
  farmId?: number | null;
  defaultOperationTypeId?: number | null;
  defaultOperationTypeName?: string | null;
  overrideToolId?: number | null;
  overrideToolName?: string | null;
  description?: string | null;
  pictureUrl?: string | null;
  official?: boolean;
  officialCurrent?: boolean | null;
  officialAuthNumber?: string | null;
  officialVersionTag?: string | null;
  officialDecisionCode?: string | null;
  officialDecisionCodeEn?: string | null;
  officialDateFirstAuthorization?: string | null;
  officialDateFrom?: string | null;
  officialDateTo?: string | null;
  officialUserGroupCode?: string | null;
  officialUserGroupEn?: string | null;
  officialFormulationTypeCode?: string | null;
  officialFormulationTypeEn?: string | null;
  officialProductTypeCodes?: string | null;
  officialProductTypeEn?: string | null;
  officialImportedAt?: string | null;
  cultureTypeId?: number | null;
  cultureTypeName?: string | null;
  cultureTypeColor?: string | null;
}

interface ToolDto {
  id: number;
  name: string;
  categoryId?: number | null;
  categoryName?: string | null;
  farmId?: number | null;
  description?: string | null;
  pictureUrl?: string | null;
}

interface ProductTypeDto {
  id: number;
  name: string;
  unitId?: number | null;
  farmId?: number | null;
  seedType?: boolean;
}

interface CultureTypeRef { id: number; code: string; name: string; color?: string | null; }

interface LabeledValue { value: string; label: string; }
interface OfficialFilterMeta { decisionCodes: LabeledValue[]; userGroups: LabeledValue[]; productTypes: LabeledValue[]; }

interface ToolCategoryDto {
  id: number;
  name: string;
}

interface UnitDto {
  id: number;
  value: string;
  farmId?: number | null;
}

interface OperationTypeDto {
  id: number;
  name: string;
  farmId?: number | null;
  defaultToolId?: number | null;
  defaultToolName?: string | null;
}

function ScopeBadge({ farmId, t }: { farmId?: number | null; t: (key: string) => string }) {
  if (farmId == null) return null;
  return (
    <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
      {t("assets.refdata.scopeFarm")}
    </span>
  );
}

function RefDataCard({ title, addForm, canAdd, children }: { title: string; addForm: ReactNode; canAdd?: boolean; children: ReactNode }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
        {canAdd && (
          <button
            type="button"
            onClick={() => setAdding((o) => !o)}
            className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              adding
                ? "bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300"
                : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300"
            }`}
          >
            {adding ? "✕" : "+ Add"}
          </button>
        )}
      </div>
      {adding && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/60">
          {addForm}
        </div>
      )}
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">{children}</ul>
    </div>
  );
}

export function meta() {
  return [
    { title: "Assets - EFMS" },
    { name: "description", content: "Manage farm products and tools" },
  ];
}

type SectionId = "products" | "tools" | "periods" | "cultures" | "reference" | "official";

export default function AssetsPage() {
  const { isAuthenticated, user } = useAuth();
  const { selectedFarm, refreshFarms } = useFarm();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const locale = useCurrentLocale();

  const [products, setProducts] = useState<ProductDto[]>([]);
  const [tools, setTools] = useState<ToolDto[]>([]);
  const [allTools, setAllTools] = useState<ToolDto[]>([]);
  const [productTypes, setProductTypes] = useState<ProductTypeDto[]>([]);
  const [cultureTypes, setCultureTypes] = useState<CultureTypeRef[]>([]);
  const [toolCategories, setToolCategories] = useState<ToolCategoryDto[]>([]);
  const [units, setUnits] = useState<UnitDto[]>([]);
  const [operationTypes, setOperationTypes] = useState<OperationTypeDto[]>([]);
  const [officialProducts, setOfficialProducts] = useState<ProductDto[]>([]);

  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingTools, setLoadingTools] = useState(false);
  const [loadingOfficial, setLoadingOfficial] = useState(false);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [addingProduct, setAddingProduct] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductTypeId, setNewProductTypeId] = useState("");
  const [newProductUnitId, setNewProductUnitId] = useState("");
  const [newProductDefaultOpTypeId, setNewProductDefaultOpTypeId] = useState("");
  const [addingTool, setAddingTool] = useState(false);
  const [newToolName, setNewToolName] = useState("");
  const [newToolCategoryId, setNewToolCategoryId] = useState("");
  const [officialQuery, setOfficialQuery] = useState("");
  const [officialDecisionCode, setOfficialDecisionCode] = useState("");
  const [officialUserGroupCode, setOfficialUserGroupCode] = useState("");
  const [officialProductTypeCode, setOfficialProductTypeCode] = useState("");
  const [officialFilterMeta, setOfficialFilterMeta] = useState<OfficialFilterMeta | null>(null);

  const [productQuery, setProductQuery] = useState("");
  const [productFilterTypeId, setProductFilterTypeId] = useState("");
  const [productFilterUnitId, setProductFilterUnitId] = useState("");
  const [productFilterOpTypeId, setProductFilterOpTypeId] = useState("");
  const [toolQuery, setToolQuery] = useState("");
  const [toolFilterCategoryId, setToolFilterCategoryId] = useState("");

  const [newUnitValue, setNewUnitValue] = useState("");
  const [newProductTypeName, setNewProductTypeName] = useState("");
  const [newProductTypeUnitId, setNewProductTypeUnitId] = useState("");
  const [newOpTypeName, setNewOpTypeName] = useState("");
  const [newToolCategoryName, setNewToolCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [savingRefData, setSavingRefData] = useState(false);

  const [activeSection, setActiveSection] = useState<SectionId>(() => {
    if (typeof window === 'undefined') return "products";
    const hash = window.location.hash.replace(/^#/, '');
    const valid: SectionId[] = ["products", "tools", "periods", "cultures", "reference", "official"];
    return (valid as string[]).includes(hash) ? (hash as SectionId) : "products";
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash.replace(/^#/, '') !== activeSection) {
      window.history.replaceState(null, '', `#${activeSection}`);
    }
  }, [activeSection]);
  const [selectedProduct, setSelectedProduct] = useState<ProductDto | null>(null);
  const [selectedTool, setSelectedTool] = useState<ToolDto | null>(null);

  const [productPage, setProductPage] = useState(0);
  const [productTotalPages, setProductTotalPages] = useState(0);
  const [toolPage, setToolPage] = useState(0);
  const [toolTotalPages, setToolTotalPages] = useState(0);
  const [officialPage, setOfficialPage] = useState(0);
  const [officialTotalPages, setOfficialTotalPages] = useState(0);

  const pageSize = 10;
  const officialPageSize = 15;

  const officialListRef = useRef<HTMLDivElement>(null);

  const farmId = selectedFarm?.id;
  const canManage = Boolean(selectedFarm?.canManage);

  const productTypeLookup = useMemo(() => new Map(productTypes.map((t) => [t.id, t])), [productTypes]);
  const unitLookup = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const toolCategoryLookup = useMemo(() => new Map(toolCategories.map((c) => [c.id, c])), [toolCategories]);

  const formatOfficialLabel = (product: ProductDto) => {
    if (!product.official) return product.name;
    const authSuffix = product.officialAuthNumber ? ` (${product.officialAuthNumber})` : "";
    return t("products.officialLabel", { defaultValue: "Official: {{name}}{{auth}}", name: product.name, auth: authSuffix });
  };

  const loadReferences = async (targetFarmId?: string) => {
    setLoadingRefs(true);
    try {
      const farmParam = targetFarmId ? `?farmId=${targetFarmId}` : "";
      const [productTypesRes, toolCategoriesRes, unitsRes, opTypesRes, cultureTypesRes] = await Promise.all([
        apiGet(`/product-types${farmParam}`),
        apiGet("/tool-categories"),
        apiGet(`/units${farmParam}`),
        apiGet(`/operations/types${farmParam}`),
        apiGet(`/culture-types${farmParam}`),
      ]);
      if (productTypesRes.ok) setProductTypes(await productTypesRes.json());
      if (toolCategoriesRes.ok) setToolCategories(await toolCategoriesRes.json());
      if (unitsRes.ok) setUnits(await unitsRes.json());
      if (opTypesRes.ok) setOperationTypes(await opTypesRes.json());
      if (cultureTypesRes.ok) setCultureTypes(await cultureTypesRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRefs(false);
    }
  };

  const loadAllTools = async (targetFarmId: string) => {
    try {
      const res = await apiGet(`/farm/${targetFarmId}/tools`);
      if (res.ok) {
        const data = await res.json();
        setAllTools(Array.isArray(data) ? data : (data.content ?? []));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadProducts = async (
    targetFarmId: string, page: number,
    query?: string, filterTypeId?: string, filterUnitId?: string, filterOpTypeId?: string
  ) => {
    setLoadingProducts(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), size: String(pageSize) });
      if (query?.trim()) params.set("query", query.trim());
      if (filterTypeId) params.set("productTypeId", filterTypeId);
      if (filterUnitId) params.set("unitId", filterUnitId);
      if (filterOpTypeId) params.set("defaultOpTypeId", filterOpTypeId);
      const res = await apiGet(`/farm/${targetFarmId}/products?${params}`);
      if (!res.ok) {
        if (res.status === 401) { navigate(buildLocalizedPath(locale, "/login")); return; }
        throw new Error("Failed to load products");
      }
      const data = await res.json();
      if (data?.content) { setProducts(data.content); setProductTotalPages(getPageMeta(data).totalPages); }
      else { setProducts(data || []); setProductTotalPages(0); }
    } catch (e) {
      console.error(e);
      setError(t("assets.errors.loadProducts"));
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadTools = async (
    targetFarmId: string, page: number,
    query?: string, filterCategoryId?: string
  ) => {
    setLoadingTools(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), size: String(pageSize) });
      if (query?.trim()) params.set("query", query.trim());
      if (filterCategoryId) params.set("categoryId", filterCategoryId);
      const res = await apiGet(`/farm/${targetFarmId}/tools?${params}`);
      if (!res.ok) {
        if (res.status === 401) { navigate(buildLocalizedPath(locale, "/login")); return; }
        throw new Error("Failed to load tools");
      }
      const data = await res.json();
      if (data?.content) { setTools(data.content); setToolTotalPages(getPageMeta(data).totalPages); }
      else { setTools(data || []); setToolTotalPages(0); }
    } catch (e) {
      console.error(e);
      setError(t("assets.errors.loadTools"));
    } finally {
      setLoadingTools(false);
    }
  };

  const loadOfficialProducts = async (
    page: number, query: string,
    decisionCode?: string, userGroupCode?: string, productTypeCode?: string
  ) => {
    setLoadingOfficial(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("size", String(officialPageSize));
      if (query.trim()) params.set("query", query.trim());
      if (decisionCode) params.set("decisionCode", decisionCode);
      if (userGroupCode) params.set("userGroupCode", userGroupCode);
      if (productTypeCode) params.set("productTypeCode", productTypeCode);
      const res = await apiGet(`/products/official?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load official products");
      const data = await res.json();
      if (data?.content) { setOfficialProducts(data.content); setOfficialTotalPages(getPageMeta(data).totalPages); }
      else { setOfficialProducts(data || []); setOfficialTotalPages(0); }
    } catch (e) {
      console.error(e);
      setError(t("assets.errors.loadOfficial", { defaultValue: "Unable to load official products." }));
    } finally {
      setLoadingOfficial(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !farmId) return;
    const id = setTimeout(() => {
      loadProducts(farmId, productPage, productQuery, productFilterTypeId, productFilterUnitId, productFilterOpTypeId);
    }, productQuery ? 300 : 0);
    return () => clearTimeout(id);
  }, [isAuthenticated, farmId, productPage, productQuery, productFilterTypeId, productFilterUnitId, productFilterOpTypeId]);

  useEffect(() => {
    if (!isAuthenticated || !farmId) return;
    const id = setTimeout(() => {
      loadTools(farmId, toolPage, toolQuery, toolFilterCategoryId);
    }, toolQuery ? 300 : 0);
    return () => clearTimeout(id);
  }, [isAuthenticated, farmId, toolPage, toolQuery, toolFilterCategoryId]);
  useEffect(() => { if (isAuthenticated) loadReferences(farmId || undefined); }, [isAuthenticated, farmId]);
  useEffect(() => {
    if (isAuthenticated) loadOfficialProducts(officialPage, officialQuery, officialDecisionCode, officialUserGroupCode, officialProductTypeCode);
  }, [isAuthenticated, officialPage, officialQuery, officialDecisionCode, officialUserGroupCode, officialProductTypeCode]);
  useEffect(() => { if (isAuthenticated && farmId) loadAllTools(farmId); }, [isAuthenticated, farmId]);
  useEffect(() => {
    if (!isAuthenticated) return;
    apiGet("/products/official/meta").then(res => { if (res.ok) res.json().then(setOfficialFilterMeta); });
  }, [isAuthenticated]);
  useEffect(() => { officialListRef.current?.scrollTo({ top: 0 }); }, [officialPage]);

  useEffect(() => {
    if (!newProductTypeId) return;
    const selectedType = productTypes.find((type) => String(type.id) === newProductTypeId);
    if (selectedType?.unitId && !newProductUnitId) setNewProductUnitId(String(selectedType.unitId));
  }, [newProductTypeId, newProductUnitId, productTypes]);

  const handleAddProduct = async () => {
    if (!farmId || !newProductName.trim() || !canManage) return;
    try {
      const res = await apiPost(`/farm/${farmId}/products`, {
        name: newProductName.trim(),
        productTypeId: newProductTypeId ? Number(newProductTypeId) : undefined,
        unitId: newProductUnitId ? Number(newProductUnitId) : undefined,
        defaultOperationTypeId: newProductDefaultOpTypeId ? Number(newProductDefaultOpTypeId) : undefined,
      });
      if (res.ok) {
        setNewProductName("");
        setNewProductTypeId("");
        setNewProductUnitId("");
        setNewProductDefaultOpTypeId("");
        setAddingProduct(false);
        await loadProducts(farmId, productPage);
      }
    } catch (e) {
      console.error(e);
      setError(t("assets.errors.addProduct", { defaultValue: "Failed to add product." }));
    }
  };

  const handleAddTool = async () => {
    if (!farmId || !newToolName.trim() || !canManage) return;
    try {
      const res = await apiPost(`/farm/${farmId}/tools`, {
        name: newToolName.trim(),
        categoryId: newToolCategoryId ? Number(newToolCategoryId) : undefined,
      });
      if (res.ok) { setNewToolName(""); setNewToolCategoryId(""); setAddingTool(false); await loadTools(farmId, toolPage); }
    } catch (e) {
      console.error(e);
      setError(t("assets.errors.addTool", { defaultValue: "Failed to add tool." }));
    }
  };

  const reloadRefs = () => loadReferences(farmId || undefined);

  const handleAddUnit = async (asGlobal: boolean) => {
    if (!newUnitValue.trim() || savingRefData) return;
    setSavingRefData(true);
    try {
      const url = asGlobal ? "/units" : `/farm/${farmId}/reference/units`;
      const res = await apiPost(url, { value: newUnitValue.trim() });
      if (res.ok) { setNewUnitValue(""); await reloadRefs(); }
    } catch (e) { console.error(e); }
    finally { setSavingRefData(false); }
  };

  const handleDeleteUnit = async (id: number, unitFarmId?: number | null) => {
    if (savingRefData) return;
    setSavingRefData(true);
    try {
      const url = unitFarmId ? `/farm/${farmId}/reference/units/${id}` : `/units/${id}`;
      await apiDelete(url);
      await reloadRefs();
    } finally { setSavingRefData(false); }
  };

  const handlePromoteUnit = async (id: number) => {
    if (savingRefData) return;
    setSavingRefData(true);
    try { await apiPost(`/units/${id}/promote`, {}); await reloadRefs(); }
    finally { setSavingRefData(false); }
  };

  const handleAddProductType = async (asGlobal: boolean) => {
    if (!newProductTypeName.trim() || savingRefData) return;
    setSavingRefData(true);
    try {
      const body = { name: newProductTypeName.trim(), unitId: newProductTypeUnitId ? Number(newProductTypeUnitId) : undefined };
      const url = asGlobal ? "/product-types" : `/farm/${farmId}/reference/product-types`;
      const res = await apiPost(url, body);
      if (res.ok) { setNewProductTypeName(""); setNewProductTypeUnitId(""); await reloadRefs(); }
    } catch (e) { console.error(e); }
    finally { setSavingRefData(false); }
  };

  const handleUpdateProductTypeUnit = async (typeId: number, ptFarmId: number | null | undefined, unitId: string) => {
    const type = productTypes.find((t) => t.id === typeId);
    if (!type || savingRefData) return;
    setSavingRefData(true);
    try {
      const url = ptFarmId ? `/farm/${farmId}/reference/product-types/${typeId}` : `/product-types/${typeId}`;
      await apiPut(url, { name: type.name, unitId: unitId ? Number(unitId) : null });
      await reloadRefs();
    } finally { setSavingRefData(false); }
  };

  const handleDeleteProductType = async (id: number, ptFarmId?: number | null) => {
    if (savingRefData) return;
    setSavingRefData(true);
    try {
      const url = ptFarmId ? `/farm/${farmId}/reference/product-types/${id}` : `/product-types/${id}`;
      await apiDelete(url);
      await reloadRefs();
    } finally { setSavingRefData(false); }
  };

  const handlePromoteProductType = async (id: number) => {
    if (savingRefData) return;
    setSavingRefData(true);
    try { await apiPost(`/product-types/${id}/promote`, {}); await reloadRefs(); }
    finally { setSavingRefData(false); }
  };

  const handleAddOpType = async (asGlobal: boolean) => {
    if (!newOpTypeName.trim() || savingRefData) return;
    setSavingRefData(true);
    try {
      const url = asGlobal ? "/operations/types" : `/farm/${farmId}/reference/operation-types`;
      const res = await apiPost(url, { name: newOpTypeName.trim() });
      if (res.ok) { setNewOpTypeName(""); await reloadRefs(); }
    } catch (e) { console.error(e); }
    finally { setSavingRefData(false); }
  };

  const handleUpdateOpTypeDefaultTool = async (opTypeId: number, toolId: string) => {
    if (!farmId || savingRefData) return;
    setSavingRefData(true);
    try {
      if (toolId) await apiPut(`/farm/${farmId}/operation-type-defaults/${opTypeId}`, { toolId: Number(toolId) });
      else await apiDelete(`/farm/${farmId}/operation-type-defaults/${opTypeId}`);
      await reloadRefs();
    } finally { setSavingRefData(false); }
  };

  const handleDeleteOpType = async (id: number, otFarmId?: number | null) => {
    if (savingRefData) return;
    setSavingRefData(true);
    try {
      const url = otFarmId ? `/farm/${farmId}/reference/operation-types/${id}` : `/operations/types/${id}`;
      await apiDelete(url);
      await reloadRefs();
    } finally { setSavingRefData(false); }
  };

  const handlePromoteOpType = async (id: number) => {
    if (savingRefData) return;
    setSavingRefData(true);
    try { await apiPost(`/operations/types/${id}/promote`, {}); await reloadRefs(); }
    finally { setSavingRefData(false); }
  };

  const handleAddToolCategory = async () => {
    if (!newToolCategoryName.trim() || savingRefData) return;
    setSavingRefData(true);
    try {
      const res = await apiPost("/tool-categories", { name: newToolCategoryName.trim() });
      if (res.ok) { setNewToolCategoryName(""); await reloadRefs(); }
    } catch (e) { console.error(e); }
    finally { setSavingRefData(false); }
  };

  const handleRenameToolCategory = async (id: number) => {
    if (!editingCategoryName.trim() || savingRefData) return;
    setSavingRefData(true);
    try {
      const res = await apiPut(`/tool-categories/${id}`, { name: editingCategoryName.trim() });
      if (res.ok) { setEditingCategoryId(null); await reloadRefs(); }
    } catch (e) { console.error(e); }
    finally { setSavingRefData(false); }
  };

  const handleDeleteToolCategory = async (id: number) => {
    if (savingRefData) return;
    setSavingRefData(true);
    try { await apiDelete(`/tool-categories/${id}`); await reloadRefs(); }
    finally { setSavingRefData(false); }
  };

  const handleUpdateProductDefaultOpType = async (product: ProductDto, opTypeId: string) => {
    if (!farmId) return;
    await apiPut(`/farm/${farmId}/products/${product.id}`, {
      name: product.name,
      productTypeId: product.productTypeId ?? null,
      unitId: product.unitId ?? null,
      defaultOperationTypeId: opTypeId ? Number(opTypeId) : null,
      overrideToolId: product.overrideToolId ?? null,
    });
    await loadProducts(farmId, productPage);
  };

  const handleDeleteProduct = async (id: number) => {
    if (!farmId) return;
    await apiDelete(`/farm/${farmId}/products/${id}`);
    await loadProducts(farmId, productPage);
  };

  const handleDeleteTool = async (id: number) => {
    if (!farmId) return;
    await apiDelete(`/farm/${farmId}/tools/${id}`);
    await loadTools(farmId, toolPage);
  };

  const handleSaveProductSheet = useCallback(async (updated: Partial<ProductSheetData>) => {
    if (!selectedProduct) return;
    if (selectedProduct.official && user?.admin) {
      await apiPut(`/admin/products/${selectedProduct.id}`, updated);
      await loadOfficialProducts(officialPage, officialQuery, officialDecisionCode, officialUserGroupCode, officialProductTypeCode);
    } else if (farmId) {
      await apiPut(`/farm/${farmId}/products/${selectedProduct.id}`, updated);
      await loadProducts(farmId, productPage, productQuery, productFilterTypeId, productFilterUnitId, productFilterOpTypeId);
    }
  }, [selectedProduct, farmId, productPage, productQuery, productFilterTypeId, productFilterUnitId, productFilterOpTypeId, officialPage, officialQuery, officialDecisionCode, officialUserGroupCode, officialProductTypeCode, user?.admin]);

  const handleSaveToolSheet = useCallback(async (updated: Partial<ToolSheetData>) => {
    if (!selectedTool || !farmId) return;
    await apiPut(`/farm/${farmId}/tools/${selectedTool.id}`, updated);
    await loadTools(farmId, toolPage, toolQuery, toolFilterCategoryId);
  }, [selectedTool, farmId, toolPage, toolQuery, toolFilterCategoryId]);

  const emptyState = !farmId;

  const navItems: { id: SectionId; label: string }[] = [
    { id: "products", label: t("assets.nav.products") },
    { id: "tools", label: t("assets.nav.tools") },
    { id: "periods", label: t("assets.nav.periods", { defaultValue: "Periods" }) },
    { id: "cultures", label: t("assets.nav.cultures", { defaultValue: "Cultures" }) },
    ...((canManage || user?.admin) ? [{ id: "reference" as SectionId, label: t("assets.nav.reference") }] : []),
    { id: "official", label: t("assets.nav.official") },
  ];


  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
                {t("assets.title", { defaultValue: "Assets" })}
              </p>
              <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
                {t("assets.heading", { defaultValue: "Products & Tools" })}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t("assets.subtitle", { defaultValue: "Manage the consumables and equipment available on the selected farm." })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => refreshFarms()}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              {t("assets.refresh", { defaultValue: "Refresh farms" })}
            </button>
          </div>

          {emptyState ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
              {t("assets.selectFarm", { defaultValue: "Select a farm first to manage its assets." })}
            </div>
          ) : (
            <>
              {!canManage && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
                  {t("assets.readOnly", { defaultValue: "You can view assets but do not have permission to edit this farm." })}
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-200">
                  {error}
                </div>
              )}

              {/* Mobile tabs */}
              <div className="flex overflow-x-auto gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800 lg:hidden">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveSection(item.id)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      activeSection === item.id
                        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                        : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex items-start gap-6">
                {/* Desktop sidebar */}
                <nav className="hidden w-48 shrink-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 lg:block">
                  <ul className="space-y-1">
                    {navItems.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setActiveSection(item.id)}
                          className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                            activeSection === item.id
                              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                              : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                          }`}
                        >
                          {item.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  {/* ── Products ── */}
                  {activeSection === "products" && (
                    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                      <header className="mb-4 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                            {t("assets.products.label", { defaultValue: "Products" })}
                          </p>
                          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            {t("assets.products.title", { defaultValue: "Farm products" })}
                          </h2>
                        </div>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => setAddingProduct((v) => !v)}
                            className={`mt-0.5 shrink-0 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                              addingProduct
                                ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
                            }`}
                          >
                            {addingProduct ? "✕" : `+ ${t("common.add", { defaultValue: "Add" })}`}
                          </button>
                        )}
                      </header>
                      {canManage && addingProduct && (
                        <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3 dark:border-indigo-900/40 dark:bg-indigo-950/20">
                          <div className="flex flex-wrap gap-2">
                            <input
                              type="text"
                              value={newProductName}
                              onChange={(e) => setNewProductName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleAddProduct(); }}
                              placeholder={t("assets.products.addPlaceholder", { defaultValue: "Add a product (e.g., seed, fertilizer)" })}
                              className="min-w-[200px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                              disabled={loadingProducts}
                            />
                            <button
                              type="button"
                              onClick={handleAddProduct}
                              disabled={loadingProducts || !newProductName.trim()}
                              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                            >
                              {t("common.add", { defaultValue: "Add" })}
                            </button>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {t("assets.products.typeLabel", { defaultValue: "Product type" })}
                              <select
                                value={newProductTypeId}
                                onChange={(e) => setNewProductTypeId(e.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                disabled={loadingRefs}
                              >
                                <option value="">{t("assets.products.typePlaceholder", { defaultValue: "No type" })}</option>
                                {productTypes.map((type) => {
                                  const unit = type.unitId ? unitLookup.get(type.unitId)?.value : "";
                                  return (
                                    <option key={type.id} value={String(type.id)}>
                                      {unit ? `${type.name} (${unit})` : type.name}
                                    </option>
                                  );
                                })}
                              </select>
                            </label>
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {t("assets.products.unitLabel", { defaultValue: "Unit" })}
                              <select
                                value={newProductUnitId}
                                onChange={(e) => setNewProductUnitId(e.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                disabled={loadingRefs}
                              >
                                <option value="">{t("assets.products.unitPlaceholder", { defaultValue: "No unit" })}</option>
                                {units.map((unit) => (
                                  <option key={unit.id} value={String(unit.id)}>{unit.value}</option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {t("assets.products.defaultOpTypeLabel", { defaultValue: "Default operation type" })}
                            <select
                              value={newProductDefaultOpTypeId}
                              onChange={(e) => setNewProductDefaultOpTypeId(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                              disabled={loadingRefs}
                            >
                              <option value="">{t("assets.products.defaultOpTypePlaceholder", { defaultValue: "No default operation type" })}</option>
                              {operationTypes.map((ot) => (
                                <option key={ot.id} value={String(ot.id)}>{ot.name}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      )}
                      {/* Search & filters */}
                      <div className="mb-3 space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="search"
                            value={productQuery}
                            onChange={(e) => { setProductQuery(e.target.value); setProductPage(0); }}
                            placeholder={t("assets.products.searchPlaceholder")}
                            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                          />
                          {(productFilterTypeId || productFilterUnitId || productFilterOpTypeId) && (
                            <button type="button" onClick={() => { setProductFilterTypeId(""); setProductFilterUnitId(""); setProductFilterOpTypeId(""); setProductPage(0); }}
                              className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                              {t("common.clearFilters")}
                            </button>
                          )}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <select value={productFilterTypeId} onChange={(e) => { setProductFilterTypeId(e.target.value); setProductPage(0); }}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            <option value="">{t("assets.products.filterType")}</option>
                            {productTypes.map((pt) => <option key={pt.id} value={String(pt.id)}>{pt.name}</option>)}
                          </select>
                          <select value={productFilterUnitId} onChange={(e) => { setProductFilterUnitId(e.target.value); setProductPage(0); }}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            <option value="">{t("assets.products.filterUnit")}</option>
                            {units.map((u) => <option key={u.id} value={String(u.id)}>{u.value}</option>)}
                          </select>
                          <select value={productFilterOpTypeId} onChange={(e) => { setProductFilterOpTypeId(e.target.value); setProductPage(0); }}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            <option value="">{t("assets.products.filterOpType")}</option>
                            {operationTypes.map((ot) => <option key={ot.id} value={String(ot.id)}>{ot.name}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="overflow-y-auto max-h-[480px]">
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                          {products.map((product) => (
                            <li key={product.id} className="group py-3">
                              <div className="flex items-start justify-between gap-3">
                                <button
                                  type="button"
                                  onClick={() => setSelectedProduct(product)}
                                  className="min-w-0 text-left"
                                >
                                  <span className="text-sm text-slate-800 underline-offset-2 group-hover:underline dark:text-slate-100">{formatOfficialLabel(product)}</span>
                                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                                    {product.productTypeId && (
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                                        {productTypeLookup.get(product.productTypeId)?.name}
                                      </span>
                                    )}
                                    {product.unitId && (
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                                        {unitLookup.get(product.unitId)?.value}
                                      </span>
                                    )}
                                    {product.defaultOperationTypeName && (
                                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
                                        {product.defaultOperationTypeName}
                                      </span>
                                    )}
                                  </div>
                                </button>
                              </div>
                            </li>
                          ))}
                          {!products.length && !loadingProducts && (
                            <li className="py-3 text-sm text-slate-500 dark:text-slate-400">
                              {(productQuery || productFilterTypeId || productFilterUnitId || productFilterOpTypeId)
                                ? t("assets.products.noResults")
                                : t("assets.products.empty")}
                            </li>
                          )}
                        </ul>
                      </div>
                      <PaginationBar page={productPage} totalPages={productTotalPages}
                        onPrev={() => setProductPage((p) => Math.max(0, p - 1))}
                        onNext={() => setProductPage((p) => Math.min(productTotalPages - 1, p + 1))} />
                    </section>
                  )}

                  {/* ── Tools ── */}
                  {activeSection === "tools" && (
                    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                      <header className="mb-4 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                            {t("assets.tools.label", { defaultValue: "Tools" })}
                          </p>
                          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            {t("assets.tools.title", { defaultValue: "Farm tools" })}
                          </h2>
                        </div>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => setAddingTool((v) => !v)}
                            className={`mt-0.5 shrink-0 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                              addingTool
                                ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
                            }`}
                          >
                            {addingTool ? "✕" : `+ ${t("common.add", { defaultValue: "Add" })}`}
                          </button>
                        )}
                      </header>
                      {canManage && addingTool && (
                        <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3 dark:border-indigo-900/40 dark:bg-indigo-950/20">
                          <div className="flex flex-wrap gap-2">
                            <input
                              type="text"
                              value={newToolName}
                              onChange={(e) => setNewToolName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleAddTool(); }}
                              placeholder={t("assets.tools.addPlaceholder", { defaultValue: "Add a tool (e.g., sprayer, tractor)" })}
                              className="min-w-[200px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                              disabled={loadingTools}
                            />
                            <button
                              type="button"
                              onClick={handleAddTool}
                              disabled={loadingTools || !newToolName.trim()}
                              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                            >
                              {t("common.add", { defaultValue: "Add" })}
                            </button>
                          </div>
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {t("assets.tools.categoryLabel", { defaultValue: "Category" })}
                            <select
                              value={newToolCategoryId}
                              onChange={(e) => setNewToolCategoryId(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                              disabled={loadingRefs}
                            >
                              <option value="">{t("assets.tools.categoryPlaceholder", { defaultValue: "No category" })}</option>
                              {toolCategories.map((category) => (
                                <option key={category.id} value={String(category.id)}>{category.name}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      )}
                      {/* Search & filters */}
                      <div className="mb-3 flex gap-2">
                        <input
                          type="search"
                          value={toolQuery}
                          onChange={(e) => { setToolQuery(e.target.value); setToolPage(0); }}
                          placeholder={t("assets.tools.searchPlaceholder")}
                          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                        />
                        <select value={toolFilterCategoryId} onChange={(e) => { setToolFilterCategoryId(e.target.value); setToolPage(0); }}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                          <option value="">{t("assets.tools.filterCategory")}</option>
                          {toolCategories.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                        </select>
                      </div>

                      <div className="overflow-y-auto max-h-[480px]">
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                          {tools.map((tool) => (
                            <li key={tool.id} className="group py-3">
                              <button
                                type="button"
                                onClick={() => setSelectedTool(tool)}
                                className="w-full text-left"
                              >
                                <span className="text-sm text-slate-800 underline-offset-2 group-hover:underline dark:text-slate-100">{tool.name}</span>
                                {(tool.categoryName || (tool.categoryId && toolCategoryLookup.get(tool.categoryId)?.name)) && (
                                  <div className="mt-1">
                                    <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                      {tool.categoryName || toolCategoryLookup.get(tool.categoryId!)?.name}
                                    </span>
                                  </div>
                                )}
                              </button>
                            </li>
                          ))}
                          {!tools.length && !loadingTools && (
                            <li className="py-3 text-sm text-slate-500 dark:text-slate-400">
                              {(toolQuery || toolFilterCategoryId)
                                ? t("assets.tools.noResults")
                                : t("assets.tools.empty")}
                            </li>
                          )}
                        </ul>
                      </div>
                      <PaginationBar page={toolPage} totalPages={toolTotalPages}
                        onPrev={() => setToolPage((p) => Math.max(0, p - 1))}
                        onNext={() => setToolPage((p) => Math.min(toolTotalPages - 1, p + 1))} />
                    </section>
                  )}

                  {/* ── Periods (campaigns) ── */}
                  {activeSection === "periods" && (
                    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                      <PeriodsSection farmId={farmId} />
                    </section>
                  )}

                  {/* ── Cultures (culture types: code, labels, default colour) ── */}
                  {activeSection === "cultures" && (
                    <section className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 p-6 text-slate-50 shadow-sm">
                      <CultureTypesManager />
                    </section>
                  )}

                  {/* ── Reference data ── */}
                  {activeSection === "reference" && (canManage || user?.admin) && (
                    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                      <header className="mb-5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                          {t("assets.refdata.label")}
                        </p>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {t("assets.refdata.title")}
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {user?.admin
                            ? t("assets.refdata.subtitleAdmin")
                            : t("assets.refdata.subtitleFarm")}
                        </p>
                      </header>
                      <div className="grid gap-6 lg:grid-cols-3">
                        {/* Units */}
                        <RefDataCard
                          title={t("assets.refdata.units.title")}
                          canAdd={canManage || user?.admin}
                          addForm={
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={newUnitValue}
                                onChange={(e) => setNewUnitValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && farmId) handleAddUnit(false); }}
                                placeholder={t("assets.refdata.units.placeholder")}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                                disabled={savingRefData}
                              />
                              <div className="flex flex-wrap gap-2">
                                {farmId && (
                                  <button type="button" onClick={() => handleAddUnit(false)}
                                    disabled={savingRefData || !newUnitValue.trim()}
                                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">
                                    {t("assets.refdata.addFarm")}
                                  </button>
                                )}
                                {user?.admin && (
                                  <button type="button" onClick={() => handleAddUnit(true)}
                                    disabled={savingRefData || !newUnitValue.trim()}
                                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-60">
                                    {t("assets.refdata.addGlobal")}
                                  </button>
                                )}
                              </div>
                            </div>
                          }
                        >
                          {units.map((unit) => (
                            <li key={unit.id} className="flex items-center justify-between gap-2 py-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="truncate text-sm text-slate-800 dark:text-slate-100">{unit.value}</span>
                                <ScopeBadge farmId={unit.farmId} t={t} />
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {user?.admin && unit.farmId && (
                                  <button type="button" onClick={() => handlePromoteUnit(unit.id)}
                                    disabled={savingRefData}
                                    className="text-xs font-semibold text-amber-600 hover:text-amber-500 disabled:opacity-50">
                                    {t("assets.refdata.promote")}
                                  </button>
                                )}
                                {(user?.admin || unit.farmId) && (
                                  <button type="button" onClick={() => handleDeleteUnit(unit.id, unit.farmId)}
                                    disabled={savingRefData}
                                    className="text-xs font-semibold text-red-600 hover:text-red-500 disabled:opacity-50 dark:text-rose-300">
                                    {t("common.delete")}
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                          {!units.length && <li className="py-2 text-sm text-slate-400">{t("assets.refdata.units.empty")}</li>}
                        </RefDataCard>

                        {/* Product types */}
                        <RefDataCard
                          title={t("assets.refdata.productTypes.title")}
                          canAdd={canManage || user?.admin}
                          addForm={
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={newProductTypeName}
                                onChange={(e) => setNewProductTypeName(e.target.value)}
                                placeholder={t("assets.refdata.productTypes.placeholder")}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                                disabled={savingRefData}
                              />
                              <select
                                value={newProductTypeUnitId}
                                onChange={(e) => setNewProductTypeUnitId(e.target.value)}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                disabled={savingRefData}
                              >
                                <option value="">{t("assets.refdata.productTypes.unitPlaceholder")}</option>
                                {units.map((u) => <option key={u.id} value={String(u.id)}>{u.value}</option>)}
                              </select>
                              <div className="flex flex-wrap gap-2">
                                {farmId && (
                                  <button type="button" onClick={() => handleAddProductType(false)}
                                    disabled={savingRefData || !newProductTypeName.trim()}
                                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">
                                    {t("assets.refdata.addFarm")}
                                  </button>
                                )}
                                {user?.admin && (
                                  <button type="button" onClick={() => handleAddProductType(true)}
                                    disabled={savingRefData || !newProductTypeName.trim()}
                                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-60">
                                    {t("assets.refdata.addGlobal")}
                                  </button>
                                )}
                              </div>
                            </div>
                          }
                        >
                          {productTypes.map((pt) => (
                            <li key={pt.id} className="py-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{pt.name}</span>
                                  <ScopeBadge farmId={pt.farmId} t={t} />
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  {user?.admin && pt.farmId && (
                                    <button type="button" onClick={() => handlePromoteProductType(pt.id)}
                                      disabled={savingRefData}
                                      className="text-xs font-semibold text-amber-600 hover:text-amber-500 disabled:opacity-50">
                                      {t("assets.refdata.promote")}
                                    </button>
                                  )}
                                  {(user?.admin || pt.farmId) && (
                                    <button type="button" onClick={() => handleDeleteProductType(pt.id, pt.farmId)}
                                      disabled={savingRefData}
                                      className="text-xs font-semibold text-red-600 hover:text-red-500 disabled:opacity-50 dark:text-rose-300">
                                      {t("common.delete")}
                                    </button>
                                  )}
                                </div>
                              </div>
                              {(user?.admin || pt.farmId) && (
                                <select
                                  value={pt.unitId != null ? String(pt.unitId) : ""}
                                  onChange={(e) => handleUpdateProductTypeUnit(pt.id, pt.farmId ?? null, e.target.value)}
                                  disabled={savingRefData}
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                >
                                  <option value="">{t("assets.refdata.productTypes.noUnit")}</option>
                                  {units.map((u) => <option key={u.id} value={String(u.id)}>{u.value}</option>)}
                                </select>
                              )}
                            </li>
                          ))}
                          {!productTypes.length && <li className="py-2 text-sm text-slate-400">{t("assets.refdata.productTypes.empty")}</li>}
                        </RefDataCard>

                        {/* Operation types */}
                        <RefDataCard
                          title={t("assets.refdata.opTypes.title")}
                          canAdd={canManage || user?.admin}
                          addForm={
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={newOpTypeName}
                                onChange={(e) => setNewOpTypeName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && farmId) handleAddOpType(false); }}
                                placeholder={t("assets.refdata.opTypes.placeholder")}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                                disabled={savingRefData}
                              />
                              <div className="flex flex-wrap gap-2">
                                {farmId && (
                                  <button type="button" onClick={() => handleAddOpType(false)}
                                    disabled={savingRefData || !newOpTypeName.trim()}
                                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">
                                    {t("assets.refdata.addFarm")}
                                  </button>
                                )}
                                {user?.admin && (
                                  <button type="button" onClick={() => handleAddOpType(true)}
                                    disabled={savingRefData || !newOpTypeName.trim()}
                                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-60">
                                    {t("assets.refdata.addGlobal")}
                                  </button>
                                )}
                              </div>
                            </div>
                          }
                        >
                          {operationTypes.map((ot) => (
                            <li key={ot.id} className="py-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{ot.name}</span>
                                  <ScopeBadge farmId={ot.farmId} t={t} />
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  {user?.admin && ot.farmId && (
                                    <button type="button" onClick={() => handlePromoteOpType(ot.id)}
                                      disabled={savingRefData}
                                      className="text-xs font-semibold text-amber-600 hover:text-amber-500 disabled:opacity-50">
                                      {t("assets.refdata.promote")}
                                    </button>
                                  )}
                                  {(user?.admin || ot.farmId) && (
                                    <button type="button" onClick={() => handleDeleteOpType(ot.id, ot.farmId)}
                                      disabled={savingRefData}
                                      className="text-xs font-semibold text-red-600 hover:text-red-500 disabled:opacity-50 dark:text-rose-300">
                                      {t("common.delete")}
                                    </button>
                                  )}
                                </div>
                              </div>
                              {farmId && (
                                <select
                                  value={ot.defaultToolId != null ? String(ot.defaultToolId) : ""}
                                  onChange={(e) => handleUpdateOpTypeDefaultTool(ot.id, e.target.value)}
                                  disabled={savingRefData}
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                >
                                  <option value="">{t("assets.refdata.opTypes.noTool")}</option>
                                  {allTools.map((tool) => <option key={tool.id} value={String(tool.id)}>{tool.name}</option>)}
                                </select>
                              )}
                            </li>
                          ))}
                          {!operationTypes.length && <li className="py-2 text-sm text-slate-400">{t("assets.refdata.opTypes.empty")}</li>}
                        </RefDataCard>

                        {/* Tool categories — admin only */}
                        {user?.admin && (
                          <RefDataCard
                            title={t("assets.refdata.toolCategories.title")}
                            canAdd={true}
                            addForm={
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={newToolCategoryName}
                                  onChange={(e) => setNewToolCategoryName(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") handleAddToolCategory(); }}
                                  placeholder={t("assets.refdata.toolCategories.placeholder")}
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                                  disabled={savingRefData}
                                />
                                <button type="button" onClick={handleAddToolCategory}
                                  disabled={savingRefData || !newToolCategoryName.trim()}
                                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-60">
                                  {t("assets.refdata.addGlobal")}
                                </button>
                              </div>
                            }
                          >
                            {toolCategories.map((c) => (
                              <li key={c.id} className="py-2">
                                {editingCategoryId === c.id ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={editingCategoryName}
                                      onChange={(e) => setEditingCategoryName(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") handleRenameToolCategory(c.id);
                                        if (e.key === "Escape") setEditingCategoryId(null);
                                      }}
                                      autoFocus
                                      className="min-w-0 flex-1 rounded border border-indigo-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none dark:border-indigo-700 dark:bg-slate-900 dark:text-slate-100"
                                      disabled={savingRefData}
                                    />
                                    <button type="button" onClick={() => handleRenameToolCategory(c.id)}
                                      disabled={savingRefData || !editingCategoryName.trim()}
                                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 disabled:opacity-50">
                                      {t("common.save", { defaultValue: "Save" })}
                                    </button>
                                    <button type="button" onClick={() => setEditingCategoryId(null)}
                                      disabled={savingRefData}
                                      className="text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50">
                                      {t("common.cancel", { defaultValue: "Cancel" })}
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-sm text-slate-800 dark:text-slate-100">{c.name}</span>
                                    <div className="flex shrink-0 items-center gap-2">
                                      <button type="button"
                                        onClick={() => { setEditingCategoryId(c.id); setEditingCategoryName(c.name); }}
                                        disabled={savingRefData}
                                        className="text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-200">
                                        {t("common.rename", { defaultValue: "Rename" })}
                                      </button>
                                      <button type="button" onClick={() => handleDeleteToolCategory(c.id)}
                                        disabled={savingRefData}
                                        className="text-xs font-semibold text-red-600 hover:text-red-500 disabled:opacity-50 dark:text-rose-300">
                                        {t("common.delete", { defaultValue: "Delete" })}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </li>
                            ))}
                            {!toolCategories.length && <li className="py-2 text-sm text-slate-400">{t("assets.refdata.toolCategories.empty")}</li>}
                          </RefDataCard>
                        )}
                      </div>
                    </section>
                  )}

                  {/* ── Official products ── */}
                  {activeSection === "official" && (
                    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                      <header className="mb-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                          {t("assets.official.label", { defaultValue: "Official catalog" })}
                        </p>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {t("assets.official.title", { defaultValue: "Official PHYTO products" })}
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {user?.admin
                            ? t("assets.official.subtitleAdmin", { defaultValue: "Click any product to view and edit its sheet." })
                            : t("assets.official.subtitle", { defaultValue: "Read-only list of products imported from the PHYTO registry." })}
                        </p>
                      </header>
                      <div className="mb-4 flex flex-col gap-2">
                        <input
                          type="text"
                          value={officialQuery}
                          onChange={(e) => { setOfficialQuery(e.target.value); setOfficialPage(0); }}
                          placeholder={t("assets.official.searchPlaceholder", { defaultValue: "Search by name or auth number" })}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                          disabled={loadingOfficial}
                        />
                        {officialFilterMeta && (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <select
                              value={officialDecisionCode}
                              onChange={(e) => { setOfficialDecisionCode(e.target.value); setOfficialPage(0); }}
                              disabled={loadingOfficial}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            >
                              <option value="">{t("admin.officialProducts.filters.allDecisions", { defaultValue: "All decisions" })}</option>
                              {officialFilterMeta.decisionCodes.map(o => (
                                <option key={o.value} value={o.value}>{o.label || o.value}</option>
                              ))}
                            </select>
                            <select
                              value={officialUserGroupCode}
                              onChange={(e) => { setOfficialUserGroupCode(e.target.value); setOfficialPage(0); }}
                              disabled={loadingOfficial}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            >
                              <option value="">{t("admin.officialProducts.filters.allGroups", { defaultValue: "All user groups" })}</option>
                              {officialFilterMeta.userGroups.map(o => (
                                <option key={o.value} value={o.value}>{o.label || o.value}</option>
                              ))}
                            </select>
                            <select
                              value={officialProductTypeCode}
                              onChange={(e) => { setOfficialProductTypeCode(e.target.value); setOfficialPage(0); }}
                              disabled={loadingOfficial}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            >
                              <option value="">{t("admin.officialProducts.filters.allTypes", { defaultValue: "All product types" })}</option>
                              {officialFilterMeta.productTypes.map(o => (
                                <option key={o.value} value={o.value}>{o.label || o.value}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        {(officialQuery || officialDecisionCode || officialUserGroupCode || officialProductTypeCode) && (
                          <button
                            type="button"
                            onClick={() => { setOfficialQuery(""); setOfficialDecisionCode(""); setOfficialUserGroupCode(""); setOfficialProductTypeCode(""); setOfficialPage(0); }}
                            className="self-start text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                          >
                            {t("common.clearFilters", { defaultValue: "Clear filters" })}
                          </button>
                        )}
                      </div>
                      <div ref={officialListRef} className={`overflow-y-auto max-h-[520px] transition-opacity duration-150 ${loadingOfficial ? "opacity-50 pointer-events-none" : ""}`}>
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                          {officialProducts.map((product) => {
                            const details: string[] = [];
                            if (product.officialVersionTag) details.push(`${t("products.version", { defaultValue: "Version" })}: ${product.officialVersionTag}`);
                            if (product.officialDecisionCode) details.push(`${t("products.decision", { defaultValue: "Decision" })}: ${product.officialDecisionCode}`);
                            if (product.officialDateFrom || product.officialDateTo) {
                              details.push(`${t("products.validity", { defaultValue: "Validity" })}: ${[product.officialDateFrom, product.officialDateTo].filter(Boolean).join(" - ")}`);
                            }
                            if (product.officialUserGroupCode) details.push(`${t("products.userGroup", { defaultValue: "User group" })}: ${product.officialUserGroupCode}`);
                            if (product.officialFormulationTypeCode) details.push(`${t("products.formulation", { defaultValue: "Formulation" })}: ${product.officialFormulationTypeCode}`);
                            if (product.officialProductTypeCodes) details.push(`${t("products.productTypes", { defaultValue: "Product types" })}: ${product.officialProductTypeCodes}`);
                            return (
                              <li key={product.id} className="group py-4">
                                <button
                                  type="button"
                                  onClick={() => setSelectedProduct(product)}
                                  className="w-full text-left"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900 underline-offset-2 group-hover:underline dark:text-slate-100">{formatOfficialLabel(product)}</p>
                                      {details.length > 0 && (
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{details.join(" · ")}</p>
                                      )}
                                    </div>
                                    <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-100">
                                      {t("products.officialTag", { defaultValue: "Official" })}
                                    </span>
                                  </div>
                                </button>
                              </li>
                            );
                          })}
                          {!officialProducts.length && !loadingOfficial && (
                            <li className="py-3 text-sm text-slate-500 dark:text-slate-400">
                              {t("assets.official.empty", { defaultValue: "No official products found." })}
                            </li>
                          )}
                        </ul>
                      </div>
                      <PaginationBar page={officialPage} totalPages={officialTotalPages}
                        onPrev={() => setOfficialPage((p) => Math.max(0, p - 1))}
                        onNext={() => setOfficialPage((p) => Math.min(officialTotalPages - 1, p + 1))} />
                    </section>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {selectedProduct && (
        <ProductSheetModal
          product={selectedProduct}
          isAdmin={user?.admin}
          canEdit={selectedProduct.official ? Boolean(user?.admin) : canManage}
          productTypes={productTypes.map((pt) => ({ id: pt.id, label: pt.unitId ? `${pt.name} (${unitLookup.get(pt.unitId)?.value ?? ""})` : pt.name }))}
          seedTypeIds={productTypes.filter((pt) => pt.seedType).map((pt) => pt.id)}
          cultureTypes={cultureTypes.map((ct) => ({ id: ct.id, label: `${ct.code} — ${ct.name}` }))}
          units={units.map((u) => ({ id: u.id, label: u.value }))}
          operationTypes={operationTypes.map((ot) => ({ id: ot.id, label: ot.name }))}
          tools={allTools.map((t) => ({ id: t.id, label: t.name }))}
          onSave={handleSaveProductSheet}
          onDelete={
            canManage && !selectedProduct.official
              ? async () => { if (farmId) { await apiDelete(`/farm/${farmId}/products/${selectedProduct.id}`); await loadProducts(farmId, productPage, productQuery, productFilterTypeId, productFilterUnitId, productFilterOpTypeId); } }
              : undefined
          }
          onClose={() => setSelectedProduct(null)}
        />
      )}
      {selectedTool && (
        <ToolSheetModal
          tool={selectedTool}
          canEdit={canManage}
          categories={toolCategories.map((c) => ({ id: c.id, label: c.name }))}
          onSave={handleSaveToolSheet}
          onDelete={
            canManage
              ? async () => { if (farmId) { await apiDelete(`/farm/${farmId}/tools/${selectedTool.id}`); await loadTools(farmId, toolPage, toolQuery, toolFilterCategoryId); } }
              : undefined
          }
          onClose={() => setSelectedTool(null)}
        />
      )}
    </ProtectedRoute>
  );
}
