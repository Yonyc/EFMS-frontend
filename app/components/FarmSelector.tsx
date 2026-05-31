import { useMemo } from 'react';
import { useTranslation } from "react-i18next";
import { useFarm } from '../contexts/FarmContext';
import { SearchableSelect } from './map/components/SearchableSelect';
import type { SelectOption } from './map/components/SearchableSelect';

export default function FarmSelector() {
  const { farms, selectedFarm, selectFarm, isLoading, error } = useFarm();
  const { t } = useTranslation();

  const options: SelectOption[] = useMemo(
    () => farms.map((farm) => ({ value: farm.id, label: farm.name })),
    [farms]
  );

  if (!selectedFarm && !isLoading && farms.length === 0) {
    return (
      <div className="px-4 py-2 text-sm text-slate-500">
        {t('farmSelector.noFarms')}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="px-4 py-2 text-sm text-slate-500">
        {t('farmSelector.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-2 text-sm text-red-400">
        {t('farmSelector.error')}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2" data-tour-id="map-farm-selector">
      <span>🏛️</span>
      <SearchableSelect
        className="w-48"
        value={selectedFarm?.id ?? ''}
        onChange={(val) => selectFarm(val || null)}
        options={options}
        placeholder={t('farmSelector.selectFarm')}
        variant="light"
        loading={isLoading}
      />
    </div>
  );
}
