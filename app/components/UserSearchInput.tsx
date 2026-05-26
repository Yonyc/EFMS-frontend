import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { apiGet } from "../utils/api";

interface UserSearchInputProps {
    value: string;
    onChange: (value: string) => void;
    onSelectUser?: (user: { id: number; username: string }) => void;
    placeholder?: string;
    className?: string;
    multiple?: boolean;
}

export default function UserSearchInput({ value, onChange, onSelectUser, placeholder, className, multiple = false }: UserSearchInputProps) {
    const { t } = useTranslation();
    const [query, setQuery] = useState(value);
    const [results, setResults] = useState<{ id: number; username: string }[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setQuery(value);
    }, [value]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    useEffect(() => {
        let currentQuery = query;
        if (multiple) {
            const parts = query.split(",");
            currentQuery = parts[parts.length - 1].trim();
        }

        if (!currentQuery || currentQuery.length < 3) {
            setResults([]);
            setSearched(false);
            setOpen(false);
            return;
        }

        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const response = await apiGet(`/users/search?q=${encodeURIComponent(currentQuery)}`);
                if (response.ok) {
                    const data = await response.json();
                    setResults(data);
                    setSearched(true);
                    setOpen(true);
                }
            } catch (error) {
                console.error("Failed to search users", error);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query, multiple]);

    const handleSelect = (user: { id: number; username: string }) => {
        if (multiple) {
            const parts = query.split(",");
            parts.pop();
            const newVal = [...parts, user.username].join(", ") + (parts.length > 0 ? "" : "");
            onChange(newVal);
            setQuery(newVal);
        } else {
            onChange(user.username);
            setQuery(user.username);
        }
        if (onSelectUser) {
            onSelectUser(user);
        }
        setOpen(false);
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <input
                type="text"
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    onChange(e.target.value);
                }}
                onFocus={() => {
                    if (results.length > 0) setOpen(true);
                }}
                placeholder={placeholder}
                className={className}
            />
            {open && results.length > 0 && (
                <ul className="absolute z-[100000] mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 text-base shadow-xl sm:text-sm">
                    {results.map((u) => (
                        <li
                            key={u.id}
                            onClick={() => handleSelect(u)}
                            className="relative cursor-pointer select-none py-2 pl-3 pr-9 text-slate-900 hover:bg-indigo-600 hover:text-white"
                        >
                            <span className="block truncate font-normal">{u.username}</span>
                        </li>
                    ))}
                </ul>
            )}
            {open && loading && (
                <div className="absolute z-[100000] mt-1 w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm text-slate-500 shadow-xl">
                    {t('common.searching', { defaultValue: 'Searching...' })}
                </div>
            )}
            {open && !loading && searched && results.length === 0 && (
                <div className="absolute z-[100000] mt-1 w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm text-slate-500 shadow-xl">
                    {t('common.userNotFound', { defaultValue: 'No user found' })}
                </div>
            )}
        </div>
    );
}
