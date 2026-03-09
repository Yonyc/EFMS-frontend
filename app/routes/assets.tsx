import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ProtectedRoute from "~/components/ProtectedRoute";
import { useAuth } from "~/contexts/AuthContext";
import { useFarm } from "~/contexts/FarmContext";
import { apiDelete, apiGet, apiPost, apiPut } from "~/utils/api";
import { buildLocalizedPath } from "~/utils/locale";
import { useNavigate } from "react-router";
import { useCurrentLocale } from "~/hooks/useCurrentLocale";

interface ProductDto {
  id: number;
  name: string;
}

interface ToolDto {
  id: number;
  name: string;
}

export function meta() {
  return [
    { title: "Assets - EFMS" },
    { name: "description", content: "Manage farm products and tools" },
  ];
}

export default function AssetsPage() {
  const { isAuthenticated } = useAuth();
  const { selectedFarm, refreshFarms } = useFarm();
  const { t } = useTranslation();
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [tools, setTools] = useState<ToolDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newProductName, setNewProductName] = useState("");
  const [newToolName, setNewToolName] = useState("");
  const navigate = useNavigate();
  const locale = useCurrentLocale();

  const farmId = selectedFarm?.id;

  const loadData = async (targetFarmId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [productRes, toolRes] = await Promise.all([
        apiGet(`/farm/${targetFarmId}/products`),
        apiGet(`/farm/${targetFarmId}/tools`),
      ]);

      if (!productRes.ok || !toolRes.ok) {
        if (productRes.status === 401 || toolRes.status === 401) {
          navigate(buildLocalizedPath(locale, "/login"));
          return;
        }
        throw new Error("Failed to load assets");
      }

      const productData = await productRes.json();
      const toolData = await toolRes.json();
      setProducts(productData);
      setTools(toolData);
    } catch (e) {
      console.error(e);
      setError("Unable to load assets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && farmId) {
      loadData(farmId);
    }
  }, [isAuthenticated, farmId]);

  const handleAddProduct = async () => {
    if (!farmId || !newProductName.trim()) return;
    try {
      const res = await apiPost(`/farm/${farmId}/products`, { name: newProductName.trim() });
      if (res.ok) {
        setNewProductName("");
        await loadData(farmId);
      }
    } catch (e) {
      console.error(e);
      setError("Failed to add product");
    }
  };

  const handleAddTool = async () => {
    if (!farmId || !newToolName.trim()) return;
    try {
      const res = await apiPost(`/farm/${farmId}/tools`, { name: newToolName.trim() });
      if (res.ok) {
        setNewToolName("");
        await loadData(farmId);
      }
    } catch (e) {
      console.error(e);
      setError("Failed to add tool");
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!farmId) return;
    await apiDelete(`/farm/${farmId}/products/${id}`);
    await loadData(farmId);
  };

  const handleDeleteTool = async (id: number) => {
    if (!farmId) return;
    await apiDelete(`/farm/${farmId}/tools/${id}`);
    await loadData(farmId);
  };

  const emptyState = !farmId;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Assets</p>
              <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">Products & Tools</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">Manage the consumables and equipment available on the selected farm.</p>
            </div>
            <button
              type="button"
              onClick={() => refreshFarms()}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              Refresh farms
            </button>
          </div>

          {emptyState ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
              Select a farm first to manage its assets.
            </div>
          ) : (
            <>
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-200">
                  {error}
                </div>
              )}

              <div className="grid gap-6 lg:grid-cols-2">
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <header className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Products</p>
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Farm products</h2>
                    </div>
                  </header>
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={newProductName}
                      onChange={(e) => setNewProductName(e.target.value)}
                      placeholder="Add a product (e.g., seed, fertilizer)"
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddProduct}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                      disabled={loading}
                    >
                      Add
                    </button>
                  </div>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {products.map((p) => (
                      <li key={p.id} className="flex items-center justify-between py-3">
                        <span className="text-sm text-slate-800 dark:text-slate-100">{p.name}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(p.id)}
                          className="text-xs font-semibold text-red-600 hover:text-red-500 dark:text-rose-300 dark:hover:text-rose-200"
                          disabled={loading}
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                    {!products.length && (
                      <li className="py-3 text-sm text-slate-500 dark:text-slate-400">No products yet.</li>
                    )}
                  </ul>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                  <header className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Tools</p>
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Farm tools</h2>
                    </div>
                  </header>
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={newToolName}
                      onChange={(e) => setNewToolName(e.target.value)}
                      placeholder="Add a tool (e.g., sprayer, tractor)"
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddTool}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                      disabled={loading}
                    >
                      Add
                    </button>
                  </div>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {tools.map((t) => (
                      <li key={t.id} className="flex items-center justify-between py-3">
                        <span className="text-sm text-slate-800 dark:text-slate-100">{t.name}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteTool(t.id)}
                          className="text-xs font-semibold text-red-600 hover:text-red-500 dark:text-rose-300 dark:hover:text-rose-200"
                          disabled={loading}
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                    {!tools.length && (
                      <li className="py-3 text-sm text-slate-500 dark:text-slate-400">No tools yet.</li>
                    )}
                  </ul>
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
