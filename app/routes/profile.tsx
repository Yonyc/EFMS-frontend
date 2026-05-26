import { useCallback, useEffect, useMemo, useState, useRef, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import ProtectedRoute from "~/components/ProtectedRoute";
import { useAuth, type TimeFormat, type DateFormat } from "~/contexts/AuthContext";
import { useFarm } from "~/contexts/FarmContext";
import { useCurrentLocale } from "~/hooks/useCurrentLocale";
import { buildLocalizedPath, buildLocalizedUrl, SUPPORTED_LOCALES, isSupportedLocale, type Locale } from "~/utils/locale";
import { apiPut, apiRequest, resolveUploadUrl } from "~/utils/api";
import { applyPostHydrationLanguage } from "~/i18n";
import { Link, useLocation, useNavigate } from "react-router";
import Cropper, { type Area } from "react-easy-crop";

export function meta() {
  return [
    { title: "Profile - EFMS" },
    { name: "description", content: "Manage your EFMS profile" },
  ];
}

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const locale = useCurrentLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refreshUser } = useAuth();
  const { farms } = useFarm();

  const [email, setEmail] = useState("");
  const [preferTopRight, setPreferTopRight] = useState(false);
  const [timeFormat, setTimeFormat] = useState<TimeFormat>('24h');
  const [dateFormat, setDateFormat] = useState<DateFormat>('auto');
  const [defaultFarmId, setDefaultFarmId] = useState<string>('');
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(true);
  const [preferredLanguage, setPreferredLanguage] = useState<string>('auto');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const username = user?.username ?? "";
  const userId = user?.id ?? "";
  const avatarUrl = user?.avatarUrl;

  const localizedMapPath = useMemo(() => buildLocalizedPath(locale, "/map"), [locale]);

  useEffect(() => {
    setEmail(user?.email ?? "");
    setPreferTopRight(!!user?.operationsPopupTopRight);
    setTimeFormat(user?.timeFormat ?? '24h');
    setDateFormat(user?.dateFormat ?? 'auto');
    setDefaultFarmId(user?.defaultFarmId ?? '');
    setEmailNotificationsEnabled(user?.emailNotificationsEnabled ?? true);
    setPreferredLanguage(user?.preferredLanguage ?? 'auto');
  }, [user?.email, user?.operationsPopupTopRight, user?.timeFormat, user?.dateFormat, user?.defaultFarmId, user?.emailNotificationsEnabled, user?.preferredLanguage]);

  const onSelectFile = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setAvatarModalOpen(true);
    };
    reader.readAsDataURL(file);
  }, []);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const getCroppedBlob = useCallback(async (src: string, cropArea: Area) => {
    const image = document.createElement('img');
    image.src = src;
    await new Promise((resolve) => { image.onload = resolve; });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = cropArea.width * pixelRatio;
    canvas.height = cropArea.height * pixelRatio;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      image,
      cropArea.x,
      cropArea.y,
      cropArea.width,
      cropArea.height,
      0,
      0,
      cropArea.width,
      cropArea.height
    );
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('toBlob failed'));
      }, 'image/jpeg', 0.9);
    });
  }, []);

  const handleReload = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await refreshUser();
    } catch (err) {
      console.error(err);
      setError(t("profile.errorLoad", { defaultValue: "Unable to reload profile" }));
    } finally {
      setLoading(false);
    }
  }, [refreshUser, t, user]);

  const handleReset = useCallback(() => {
    setEmail(user?.email ?? "");
    setPreferTopRight(!!user?.operationsPopupTopRight);
    setTimeFormat(user?.timeFormat ?? '24h');
    setDateFormat(user?.dateFormat ?? 'auto');
    setDefaultFarmId(user?.defaultFarmId ?? '');
    setEmailNotificationsEnabled(user?.emailNotificationsEnabled ?? true);
    setPreferredLanguage(user?.preferredLanguage ?? 'auto');
    setError(null);
    setSuccess(null);
  }, [user?.email, user?.operationsPopupTopRight, user?.timeFormat, user?.dateFormat, user?.defaultFarmId, user?.emailNotificationsEnabled, user?.preferredLanguage]);

  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, any> = {
        operationsPopupTopRight: preferTopRight,
        timeFormat,
        dateFormat,
        defaultFarmId: defaultFarmId || null,
        emailNotificationsEnabled,
        preferredLanguage: preferredLanguage === 'auto' ? null : preferredLanguage,
      };
      if (email.trim()) payload.email = email.trim();
      const res = await apiPut("/users/me", payload);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      // copy locally so a refresh before the next user fetch keeps the choice
      try {
        if (preferredLanguage === 'auto') localStorage.removeItem('preferredLanguage');
        else localStorage.setItem('preferredLanguage', preferredLanguage);
      } catch {}
      // apply now so the user doesn't have to refresh
      if (preferredLanguage === 'auto') {
        applyPostHydrationLanguage();
      } else if (isSupportedLocale(preferredLanguage) && i18n.language !== preferredLanguage) {
        await i18n.changeLanguage(preferredLanguage);
      }
      const targetLocale: Locale = isSupportedLocale(i18n.language) ? (i18n.language as Locale) : locale;
      if (targetLocale !== locale) {
        navigate(buildLocalizedUrl(targetLocale, location.pathname, location.search, location.hash), { replace: true });
      }
      await refreshUser();
      setSuccess(t("profile.saved", { defaultValue: "Profile updated" }));
    } catch (err) {
      console.error(err);
      setError(t("profile.errorSave", { defaultValue: "Failed to update profile" }));
    } finally {
      setSaving(false);
    }
  }, [email, preferTopRight, timeFormat, dateFormat, defaultFarmId, emailNotificationsEnabled, preferredLanguage, refreshUser, t, user, i18n, navigate, location.pathname, location.search, location.hash, locale]);

  const handleUploadAvatar = useCallback(async () => {
    if (!imageSrc || !croppedAreaPixels || !user) return;
    setAvatarUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels);
      const formData = new FormData();
      formData.append('file', blob, 'avatar.jpg');
      const res = await apiRequest('/users/me/avatar', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());
      await refreshUser();
      setAvatarModalOpen(false);
      setImageSrc(null);
      setSuccess(t('profile.avatarUpdated', { defaultValue: 'Avatar updated' }));
    } catch (err) {
      console.error(err);
      setError(t('profile.avatarError', { defaultValue: 'Failed to update avatar' }));
    } finally {
      setAvatarUploading(false);
    }
  }, [croppedAreaPixels, getCroppedBlob, imageSrc, refreshUser, t, user]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 px-4 py-10 text-slate-50">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          <header className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-indigo-300">{t("profile.title", { defaultValue: "Profile" })}</p>
              <h1 className="text-3xl font-semibold text-white">{t("profile.subtitle", { defaultValue: "Manage your account" })}</h1>
            </div>
            <Link
              to={localizedMapPath}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              {t("profile.backToMap", { defaultValue: "Back to map" })}
            </Link>
          </header>

          {(error || success) && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                error
                  ? "border-rose-400/40 bg-rose-500/10 text-rose-100"
                  : "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
              }`}
            >
              {error || success}
            </div>
          )}

          <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/30">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-4 items-center">
                <div className="relative h-16 w-16 overflow-hidden rounded-full border border-white/20 bg-white/10">
                  {avatarUrl ? (
                    <img src={resolveUploadUrl(avatarUrl) ?? avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-slate-200">
                      {username ? username.charAt(0).toUpperCase() : "?"}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-200">{t("profile.account" , { defaultValue: "Account" })}</p>
                  <h2 className="text-xl font-semibold text-white">{username || t("profile.unknown", { defaultValue: "Unknown user" })}</h2>
                  <p className="text-xs text-slate-300">ID: {userId || "-"}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                      disabled={avatarUploading}
                    >
                      {t('profile.changeAvatar', { defaultValue: 'Change avatar' })}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={onSelectFile}
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
                  disabled={saving}
                >
                  {t("profile.reset", { defaultValue: "Reset" })}
                </button>
                <button
                  type="button"
                  onClick={handleReload}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                  disabled={loading || saving}
                >
                  {loading ? t("common.loading", { defaultValue: "Loading..." }) : t("profile.reload", { defaultValue: "Reload" })}
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-100">
                {t("profile.username", { defaultValue: "Username" })}
                <input
                  value={username}
                  disabled
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 shadow-inner shadow-black/10"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-slate-100">
                {t("profile.email", { defaultValue: "Email" })}
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                />
              </label>
            </div>

            <div className="mt-6 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-200">
                {t("profile.preferences", { defaultValue: "Preferences" })}
              </p>

              <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100">
                <input
                  type="checkbox"
                  checked={preferTopRight}
                  onChange={(e) => setPreferTopRight(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-white/30 bg-white/10 text-indigo-500"
                />
                <div>
                  <div className="font-semibold">{t("profile.pinTopRight", { defaultValue: "Open operations popup at top-right" })}</div>
                  <p className="text-xs text-slate-300">{t("profile.pinTopRightHint", { defaultValue: "Also used on the map operations popup." })}</p>
                </div>
              </label>

              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-sm font-semibold text-slate-100">{t("profile.timeFormat", { defaultValue: "Time format" })}</div>
                <p className="text-xs text-slate-300">{t("profile.timeFormatHint", { defaultValue: "How clock times are shown across the app." })}</p>
                <div className="mt-2 flex gap-2">
                  {(['24h', '12h'] as TimeFormat[]).map((opt) => (
                    <label key={opt} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold ${timeFormat === opt ? 'border-indigo-400 bg-indigo-500/20 text-white' : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'}`}>
                      <input
                        type="radio"
                        name="timeFormat"
                        value={opt}
                        checked={timeFormat === opt}
                        onChange={() => setTimeFormat(opt)}
                        className="sr-only"
                      />
                      {t(`profile.timeFormatOptions.${opt}`, { defaultValue: opt === '24h' ? '24-hour (13:45)' : '12-hour (1:45 PM)' })}
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100">
                <span className="font-semibold">{t("profile.dateFormat", { defaultValue: "Date format" })}</span>
                <span className="text-xs text-slate-300">{t("profile.dateFormatHint", { defaultValue: "Auto matches your language; pick a fixed format to override." })}</span>
                <select
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value as DateFormat)}
                  className="mt-2 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                >
                  <option value="auto">{t("profile.dateFormatOptions.auto", { defaultValue: "Auto (from language)" })}</option>
                  <option value="DD-MM-YYYY">DD/MM/YYYY</option>
                  <option value="MM-DD-YYYY">MM/DD/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100">
                <span className="font-semibold">{t("profile.preferredLanguage", { defaultValue: "Language" })}</span>
                <span className="text-xs text-slate-300">{t("profile.preferredLanguageHint", { defaultValue: "Overrides your browser language." })}</span>
                <select
                  value={preferredLanguage}
                  onChange={(e) => setPreferredLanguage(e.target.value)}
                  className="mt-2 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                >
                  <option value="auto">{t("profile.preferredLanguageOptions.auto", { defaultValue: "Auto (browser language)" })}</option>
                  {SUPPORTED_LOCALES.map((loc) => (
                    <option key={loc} value={loc}>{t(`profile.preferredLanguageOptions.${loc}`, { defaultValue: loc.toUpperCase() })}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100">
                <span className="font-semibold">{t("profile.defaultFarm", { defaultValue: "Default farm" })}</span>
                <span className="text-xs text-slate-300">{t("profile.defaultFarmHint", { defaultValue: "Auto-selected after fresh login. Refresh keeps whatever farm you last used." })}</span>
                <select
                  value={defaultFarmId}
                  onChange={(e) => setDefaultFarmId(e.target.value)}
                  className="mt-2 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none"
                >
                  <option value="">{t("profile.defaultFarmNone", { defaultValue: "No default (show picker)" })}</option>
                  {farms.map((farm) => (
                    <option key={farm.id} value={farm.id}>{farm.name}</option>
                  ))}
                </select>
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100">
                <input
                  type="checkbox"
                  checked={emailNotificationsEnabled}
                  onChange={(e) => setEmailNotificationsEnabled(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-white/30 bg-white/10 text-indigo-500"
                />
                <div>
                  <div className="font-semibold">{t("profile.emailNotifications", { defaultValue: "Email notifications" })}</div>
                  <p className="text-xs text-slate-300">{t("profile.emailNotificationsHint", { defaultValue: "Master switch for shares, imports and parcel alerts." })}</p>
                </div>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400 disabled:opacity-60"
              >
                {saving ? t("profile.saving", { defaultValue: "Saving..." }) : t("profile.save", { defaultValue: "Save changes" })}
              </button>
            </div>
          </section>
        </div>
      </div>

      {avatarModalOpen && imageSrc && (
        <div className="fixed inset-0 z-[200000] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 p-4 text-white shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">{t('profile.cropTitle', { defaultValue: 'Crop avatar' })}</h3>
              <button
                type="button"
                onClick={() => { setAvatarModalOpen(false); setImageSrc(null); }}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm"
                disabled={avatarUploading}
              >
                ×
              </button>
            </div>
            <div className="relative h-[320px] w-full overflow-hidden rounded-xl bg-slate-800">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1"
              />
              <button
                type="button"
                onClick={handleUploadAvatar}
                disabled={avatarUploading}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400 disabled:opacity-60"
              >
                {avatarUploading ? t('profile.uploading', { defaultValue: 'Uploading...' }) : t('profile.saveAvatar', { defaultValue: 'Save avatar' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
