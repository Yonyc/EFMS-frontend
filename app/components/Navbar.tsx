import { Disclosure, DisclosureButton, DisclosurePanel, Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { useTranslation } from "react-i18next";
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'
import { CircleFlagLanguage } from 'react-circle-flags'
import { useAuth } from '../contexts/AuthContext'
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import FarmSelector from './FarmSelector';
import { buildLocalizedPath, buildLocalizedUrl, SUPPORTED_LOCALES } from '../utils/locale';
import type { Locale } from '../utils/locale';

const NAV_ITEMS = [
    { translationId: 'nav.home', slug: '', end: true },
    { translationId: 'nav.map', slug: 'map', end: false },
    { translationId: 'nav.wiki', slug: 'wiki', end: false }
] as const;

function classNames(...classes: string[]) {
    return classes.filter(Boolean).join(' ')
}

interface NavbarProps {
    currentLocale: Locale;
}

export default function Navbar({ currentLocale }: NavbarProps) {
    const { i18n, t } = useTranslation();
    const { isAuthenticated, user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const localizedPath = (slug: string) => buildLocalizedPath(currentLocale, slug ? `/${slug}` : '/');

    const handleLanguageChange = (lang: Locale) => {
        if (lang === currentLocale) {
            return;
        }

        i18n.changeLanguage(lang);
        const nextUrl = buildLocalizedUrl(lang, location.pathname, location.search, location.hash);
        navigate(nextUrl, { replace: true });
    };

    const handleLogout = () => {
        logout();
        navigate(localizedPath('login'));
    };

    return (
        <Disclosure
            as="nav"
            className="relative bg-gray-800/50 after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-white/10"
        >
            <div className="mx-auto max-w-7xl px-2 sm:px-6 lg:px-8">
                <div className="relative flex h-16 items-center justify-between">
                    <div className="absolute inset-y-0 left-0 flex items-center sm:hidden">
                        {/* Mobile menu button*/}
                        <DisclosureButton className="group relative inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-white/5 hover:text-white focus:outline-2 focus:-outline-offset-1 focus:outline-indigo-500">
                            <span className="absolute -inset-0.5" />
                            <span className="sr-only">Open main menu</span>
                            <Bars3Icon aria-hidden="true" className="block size-6 group-data-open:hidden" />
                            <XMarkIcon aria-hidden="true" className="hidden size-6 group-data-open:block" />
                        </DisclosureButton>
                    </div>
                    <div className="flex flex-1 items-center justify-center sm:items-stretch sm:justify-start">
                        <div className="flex shrink-0 items-center">
                            <img
                                alt="Your Company"
                                src="https://tailwindcss.com/plus-assets/img/logos/mark.svg?color=indigo&shade=500"
                                className="h-8 w-auto"
                            />
                        </div>
                        <div className="hidden sm:ml-6 sm:block">
                            <div className="flex space-x-4">
                                {NAV_ITEMS.map((item) => (
                                    <NavLink
                                        key={item.translationId}
                                        to={localizedPath(item.slug)}
                                        end={Boolean(item.end)}
                                        className={({ isActive }) =>
                                            classNames(
                                                isActive ? 'bg-gray-950/50 text-white' : 'text-gray-300 hover:bg-white/5 hover:text-white',
                                                'rounded-md px-3 py-2 text-sm font-medium',
                                            )
                                        }
                                    >
                                        {t(item.translationId)}
                                    </NavLink>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-2 sm:static sm:inset-auto sm:ml-6 sm:pr-0">
                        {/* Farm Selector - Only show when authenticated */}
                        {isAuthenticated && <FarmSelector />}
                        
                        {/* Language Switcher */}
                        <Menu as="div" className="relative ml-3">
                            <MenuButton className="relative flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500">
                                <span className="absolute -inset-1.5" />
                                <span className="sr-only">{t('nav.language_switcher')}</span>
                                <CircleFlagLanguage languageCode={currentLocale} className="size-8 rounded-full bg-gray-800 outline -outline-offset-1 outline-white/10" />
                            </MenuButton>
                            <MenuItems
                                transition
                                className="absolute right-0 z-500 mt-2 w-48 origin-top-right rounded-md bg-gray-800 py-1 outline -outline-offset-1 outline-white/10 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
                            >
                                {SUPPORTED_LOCALES.filter((lang) => lang !== currentLocale).map((lang) => (
                                    <MenuItem key={lang}>
                                        <button
                                            type="button"
                                            className="block w-full px-4 py-2 text-left text-sm text-gray-300 data-focus:bg-white/5 data-focus:outline-hidden"
                                            onClick={() => handleLanguageChange(lang)}
                                        >
                                            <CircleFlagLanguage languageCode={lang} className="size-6 inline-block mr-2" />
                                            {t(`languages.${lang}` as const)}
                                        </button>
                                    </MenuItem>
                                ))}
                            </MenuItems>
                        </Menu>

                        {/* Profile dropdown or Login button */}
                        {isAuthenticated ? (
                            <Menu as="div" className="relative ml-3">
                                <MenuButton className="relative flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500">
                                    <span className="absolute -inset-1.5" />
                                    <span className="sr-only">{t('nav.user_menu')}</span>
                                    <img
                                        alt=""
                                        src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
                                        className="size-8 rounded-full bg-gray-800 outline -outline-offset-1 outline-white/10"
                                    />
                                </MenuButton>

                                <MenuItems
                                    transition
                                    className="absolute right-0 z-500 mt-2 w-48 origin-top-right rounded-md bg-gray-800 py-1 outline -outline-offset-1 outline-white/10 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
                                >
                                    <div className="px-4 py-2 text-xs text-gray-400 border-b border-white/10">
                                        {user?.username}
                                    </div>
                                    <MenuItem>
                                        <a
                                            href="#"
                                            className="block px-4 py-2 text-sm text-gray-300 data-focus:bg-white/5 data-focus:outline-hidden"
                                        >
                                            {t('nav.profile')}
                                        </a>
                                    </MenuItem>
                                    <MenuItem>
                                        <Link
                                            to={localizedPath('imports')}
                                            className="block px-4 py-2 text-sm text-gray-300 data-focus:bg-white/5 data-focus:outline-hidden"
                                        >
                                            {t('nav.imports')}
                                        </Link>
                                    </MenuItem>
                                    <MenuItem>
                                        <Link
                                            to={localizedPath('create-farm')}
                                            className="block px-4 py-2 text-sm text-gray-300 data-focus:bg-white/5 data-focus:outline-hidden"
                                        >
                                            {t('nav.create_farm')}
                                        </Link>
                                    </MenuItem>
                                    <MenuItem>
                                        <a
                                            href="#"
                                            className="block px-4 py-2 text-sm text-gray-300 data-focus:bg-white/5 data-focus:outline-hidden"
                                        >
                                            {t('nav.settings')}
                                        </a>
                                    </MenuItem>
                                    <MenuItem>
                                        <button
                                            onClick={handleLogout}
                                            className="block w-full text-left px-4 py-2 text-sm text-gray-300 data-focus:bg-white/5 data-focus:outline-hidden"
                                        >
                                            {t('nav.sign_out')}
                                        </button>
                                    </MenuItem>
                                </MenuItems>
                            </Menu>
                        ) : (
                            <Link
                                to={localizedPath('login')}
                                className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                            >
                                {t('nav.sign_in') || 'Sign In'}
                            </Link>
                        )}
                    </div>
                </div>
            </div>

            <DisclosurePanel className="sm:hidden">
                <div className="space-y-1 px-2 pt-2 pb-3">
                    {NAV_ITEMS.map((item) => (
                        <DisclosureButton
                            key={item.translationId}
                            as={NavLink}
                            to={localizedPath(item.slug)}
                            end={Boolean(item.end)}
                            className={({ isActive }: { isActive: boolean }) =>
                                classNames(
                                    isActive ? 'bg-gray-950/50 text-white' : 'text-gray-300 hover:bg-white/5 hover:text-white',
                                    'block rounded-md px-3 py-2 text-base font-medium',
                                )
                            }
                        >
                            {t(item.translationId)}
                        </DisclosureButton>
                    ))}
                </div>
            </DisclosurePanel>
        </Disclosure>
    )
}