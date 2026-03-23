"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { resolveSymbol } from "@/lib/actions/portfolio";
import type { HoldingResolutionCandidate } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SymbolSearchProps {
  onSelect: (candidate: HoldingResolutionCandidate) => void;
  placeholder?: string;
  className?: string;
}

export function SymbolSearch({
  onSelect,
  placeholder = "Search ticker or company...",
  className,
}: SymbolSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HoldingResolutionCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 1) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const { candidates } = await resolveSymbol(q.trim());
      setResults(candidates);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-white/10 bg-surface-raised py-2.5 pl-9 pr-3 text-sm text-slate-200 outline-none transition focus:border-brand focus:ring-1 focus:ring-brand"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-surface-raised shadow-[0_16px_40px_rgba(0,0,0,0.3)]">
          {results.map((r) => (
            <button
              key={`${r.symbol}-${r.exchange}`}
              type="button"
              onClick={() => {
                onSelect(r);
                setQuery("");
                setOpen(false);
                setResults([]);
              }}
              className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-white/5"
            >
              <div>
                <span className="text-sm font-semibold text-white">{r.symbol}</span>
                <span className="ml-2 text-sm text-slate-500">{r.name}</span>
              </div>
              <span className="text-xs text-slate-600">{r.exchange}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
