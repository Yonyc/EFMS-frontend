import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ProtectedRoute from "~/components/ProtectedRoute";
import { useAuth } from "~/contexts/AuthContext";
import { useFarm } from "~/contexts/FarmContext";
import { apiGet, apiPost } from "~/utils/api";

interface ParcelSummary {
  id: number;
  name: string;
}

interface OperationTypeDto {
  id: number;
  name: string;
}

interface UnitDto {
  id: number;
  value: string;
}

interface ProductDto {
  id: number;
  name: string;
}

interface ToolDto {
  id: number;
  name: string;
}

interface OperationProductDto {
  id: number;
  quantity?: number;
  productId?: number;
  productName?: string;
  unitId?: number;
  unitValue?: string;
  toolId?: number;
  toolName?: string;
}

interface ParcelOperationDto {
  id: number;
  date?: string;
  durationSeconds?: number;
  typeId?: number;
  typeName?: string;
  products?: OperationProductDto[];
}

interface OperationProductInputState {
  productId: string;
  quantity: string;
  unitId: string;
  toolId: string;
}

export function meta() {
  return [
    { title: "Operations - EFMS" },
    { name: "description", content: "Manage parcel operations" },
  ];
}

export default function OperationsPage() {
  const { isAuthenticated } = useAuth();
  const { selectedFarm, refreshFarms } = useFarm();
  const { t } = useTranslation();

  const [parcels, setParcels] = useState<ParcelSummary[]>([]);
  const [selectedParcelId, setSelectedParcelId] = useState<number | null>(null);
  const [operationTypes, setOperationTypes] = useState<OperationTypeDto[]>([]);
  const [operations, setOperations] = useState<ParcelOperationDto[]>([]);
  const [units, setUnits] = useState<UnitDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [tools, setTools] = useState<ToolDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [typeId, setTypeId] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [durationMinutes, setDurationMinutes] = useState<string>("");
  const [productLines, setProductLines] = useState<OperationProductInputState[]>([
    { productId: "", quantity: "", unitId: "", toolId: "" },
  ]);

  const farmId = selectedFarm?.id;

  const loadParcels = async (farm: string) => {
    setError(null);
    try {
      const res = await apiGet(`/farm/${farm}/parcels`);
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setParcels(data);
      if (selectedParcelId && !data.find((p: ParcelSummary) => p.id === selectedParcelId)) {
        setSelectedParcelId(null);
      }
    } catch (e) {
      console.error(e);
      setError("Unable to load parcels");
    }
  };

  const loadReferences = async (farm: string) => {
    try {
      const [typesRes, unitsRes, productsRes, toolsRes] = await Promise.all([
        apiGet(`/operations/types`),
        apiGet(`/units`),
        apiGet(`/farm/${farm}/products`),
        apiGet(`/farm/${farm}/tools`),
      ]);

      if (typesRes.ok) setOperationTypes(await typesRes.json());
      if (unitsRes.ok) setUnits(await unitsRes.json());
      if (productsRes.ok) setProducts(await productsRes.json());
      if (toolsRes.ok) setTools(await toolsRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  const loadOperations = async (farm: string, parcel: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet(`/farm/${farm}/parcels/${parcel}/operations`);
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setOperations(data);
    } catch (e) {
      console.error(e);
      setError("Unable to load operations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (farmId) {
      loadParcels(farmId);
      loadReferences(farmId);
    }
  }, [farmId]);

  useEffect(() => {
    if (farmId && selectedParcelId) {
      loadOperations(farmId, selectedParcelId);
    }
    if (!selectedParcelId) {
      setOperations([]);
    }
  }, [farmId, selectedParcelId]);

  const handleAddLine = () => {
    setProductLines((prev) => [...prev, { productId: "", quantity: "", unitId: "", toolId: "" }]);
  };

  const handleRemoveLine = (index: number) => {
    setProductLines((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, key: keyof OperationProductInputState, value: string) => {
    setProductLines((prev) => prev.map((line, i) => (i === index ? { ...line, [key]: value } : line)));
  };

  const handleCreateOperation = async () => {
    if (!farmId || !selectedParcelId) return;
    setCreating(true);
    setError(null);
    try {
      const productsPayload = productLines
        .filter((line) => line.productId)
        .map((line) => ({
          productId: Number(line.productId),
          quantity: line.quantity ? Number(line.quantity) : undefined,
          unitId: line.unitId ? Number(line.unitId) : undefined,
          toolId: line.toolId ? Number(line.toolId) : undefined,
        }));

      const payload: any = {
        typeId: typeId ? Number(typeId) : undefined,
        date: date ? new Date(date).toISOString() : undefined,
        durationSeconds: durationMinutes ? Number(durationMinutes) * 60 : undefined,
        products: productsPayload,
      };

      const res = await apiPost(`/farm/${farmId}/parcels/${selectedParcelId}/operations`, payload);
      if (!res.ok) throw new Error("failed");
      setTypeId("");
      setDate("");
      setDurationMinutes("");
      setProductLines([{ productId: "", quantity: "", unitId: "", toolId: "" }]);
      await loadOperations(farmId, selectedParcelId);
    } catch (e) {
      console.error(e);
      setError("Failed to create operation");
    } finally {
      setCreating(false);
    }
  };

  const selectedParcel = useMemo(
    () => parcels.find((p) => p.id === selectedParcelId),
    [parcels, selectedParcelId]
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 px-4 py-10 text-slate-50">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-indigo-300">{t("operations.title")}</p>
              <h1 className="text-3xl font-semibold text-white">{t("operations.subtitle")}</h1>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => farmId && loadParcels(farmId)}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                {t("operations.refreshParcels")}
              </button>
              <button
                type="button"
                onClick={() => refreshFarms()}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                {t("operations.refreshFarms")}
              </button>
            </div>
          </header>

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/15 p-4 text-sm text-rose-100">{error}</div>
          )}

          {!farmId ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-slate-100 shadow-xl shadow-black/30">
              {t("farmSelector.selectFarm")}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/30">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <label className="block text-sm font-semibold text-slate-100">{t("operations.selectParcel")}</label>
                  <select
                    className="mt-2 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                    value={selectedParcelId ?? ""}
                    onChange={(e) => setSelectedParcelId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">{t("operations.noParcel")}</option>
                    {parcels.map((parcel) => (
                      <option key={parcel.id} value={parcel.id}>
                        {parcel.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-100">{t("operations.selectType")}</label>
                  <select
                    className="mt-2 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                    value={typeId}
                    onChange={(e) => setTypeId(e.target.value)}
                  >
                    <option value="">{t("operations.selectTypePlaceholder")}</option>
                    {operationTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 sm:col-span-1">
                  <div>
                    <label className="block text-sm font-semibold text-slate-100">{t("operations.dateLabel")}</label>
                    <input
                      type="datetime-local"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="mt-2 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-100">{t("operations.durationLabel")}</label>
                    <input
                      type="number"
                      min="0"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value)}
                      className="mt-2 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Products & Tools</h3>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10"
                  >
                    + Add line
                  </button>
                </div>
                <div className="space-y-3">
                  {productLines.map((line, index) => (
                    <div key={index} className="grid gap-2 rounded-xl border border-white/10 bg-slate-900/60 p-3 sm:grid-cols-5">
                      <select
                        className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                        value={line.productId}
                        onChange={(e) => updateLine(index, "productId", e.target.value)}
                      >
                        <option value="">Product</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        placeholder="Qty"
                        value={line.quantity}
                        onChange={(e) => updateLine(index, "quantity", e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                      />
                      <select
                        className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                        value={line.unitId}
                        onChange={(e) => updateLine(index, "unitId", e.target.value)}
                      >
                        <option value="">Unit</option>
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.value}
                          </option>
                        ))}
                      </select>
                      <select
                        className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                        value={line.toolId}
                        onChange={(e) => updateLine(index, "toolId", e.target.value)}
                      >
                        <option value="">Tool</option>
                        {tools.map((tool) => (
                          <option key={tool.id} value={tool.id}>
                            {tool.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center justify-end">
                        {productLines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(index)}
                            className="text-xs font-semibold text-rose-200 hover:text-rose-100"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleCreateOperation}
                  disabled={!selectedParcel || creating}
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
                >
                  {creating ? t("common.loading") : t("operations.submit")}
                </button>
              </div>
            </div>
          )}

          {selectedParcel ? (
            <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/30">
              <header className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-300">{t("operations.history")}</p>
                  <h2 className="text-lg font-semibold text-white">{selectedParcel.name}</h2>
                </div>
                {loading && <span className="text-xs text-slate-200">{t("common.loading")}</span>}
              </header>
              {!operations.length ? (
                <p className="text-sm text-slate-200">{t("operations.emptyHistory")}</p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {operations.map((op) => (
                    <li key={op.id} className="py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">{op.typeName || t("operations.selectTypePlaceholder")}</p>
                          <p className="text-xs text-slate-300">
                            {op.date ? new Date(op.date).toLocaleString() : ""}
                          </p>
                        </div>
                        {op.durationSeconds != null && (
                          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
                            {(op.durationSeconds / 60).toFixed(0)} min
                          </span>
                        )}
                      </div>
                      {op.products && op.products.length > 0 && (
                        <div className="rounded-lg border border-white/5 bg-white/5 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-200">Products / Tools</p>
                          <ul className="mt-2 space-y-1 text-sm text-slate-100">
                            {op.products.map((p) => (
                              <li key={p.id || `${p.productId}-${p.toolId}` } className="flex items-center justify-between gap-3">
                                <div>
                                  <span className="font-semibold">{p.productName || "Product"}</span>
                                  {p.quantity != null && (
                                    <span className="ml-2 text-slate-300">
                                      {p.quantity}
                                      {p.unitValue ? ` ${p.unitValue}` : ""}
                                    </span>
                                  )}
                                </div>
                                {p.toolName && (
                                  <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-indigo-100">{p.toolName}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-slate-200 shadow-xl shadow-black/30">
              {t("operations.noParcel")}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
