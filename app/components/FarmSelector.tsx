import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { useFarm } from '../contexts/FarmContext';

export default function FarmSelector() {
  const { farms, selectedFarm, selectFarm, isLoading, error } = useFarm();

  if (!selectedFarm && !isLoading && farms.length === 0) {
    return (
      <div className="px-4 py-2 text-sm text-gray-400">
        No farms available
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="px-4 py-2 text-sm text-gray-400">
        Loading farms...
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-2 text-sm text-red-400">
        {error}
      </div>
    );
  }

  return (
    <Menu as="div" className="relative">
      <MenuButton className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-300 hover:bg-white/5 hover:text-white rounded-md transition-colors">
        <span>🏛️</span>
        <span>{selectedFarm?.name || 'Select Farm'}</span>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </MenuButton>

      <MenuItems
        transition
        className="absolute left-0 z-500 mt-2 w-56 origin-top-left rounded-md bg-gray-800 py-1 outline -outline-offset-1 outline-white/10 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
      >
        {farms.map((farm) => (
          <MenuItem key={farm.id}>
            <button
              onClick={() => selectFarm(farm.id)}
              className={`block w-full text-left px-4 py-2 text-sm transition-colors ${
                selectedFarm?.id === farm.id
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 data-focus:bg-white/5 data-focus:outline-hidden'
              }`}
            >
              <div className="flex items-center gap-2">
                <span>🏛️</span>
                <div className="flex-1">
                  <div className="font-medium">{farm.name}</div>
                  {farm.location && (
                    <div className="text-xs opacity-75">{farm.location}</div>
                  )}
                </div>
                {selectedFarm?.id === farm.id && (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </button>
          </MenuItem>
        ))}
        
        {farms.length === 0 && (
          <div className="px-4 py-2 text-sm text-gray-400">
            No farms available
          </div>
        )}
      </MenuItems>
    </Menu>
  );
}
