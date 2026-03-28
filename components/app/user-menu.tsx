"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChevronDown, LogOut, Settings, Shield } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { sanitizeExternalUrl } from "@/lib/security/external-url";

export function UserMenu({ showAdminLink = false }: { showAdminLink?: boolean }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<{
    displayName: string | null;
    avatarUrl: string | null;
    handle: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadCurrentUser() {
      const { data: { user: u } } = await supabase.auth.getUser();
      setUser(u ?? null);
      if (u) {
        const { data } = await supabase
          .from("user_profiles")
          .select("display_name, avatar_url, handle")
          .eq("user_id", u.id)
          .maybeSingle();
        setProfile({
          displayName: (data?.display_name as string | null) ?? null,
          avatarUrl: (data?.avatar_url as string | null) ?? null,
          handle: (data?.handle as string | null) ?? null,
        });
      } else {
        setProfile(null);
      }
      setLoading(false);
    }

    void loadCurrentUser();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        const nextUser = session?.user ?? null;
        setUser(nextUser);
        if (nextUser) {
          const { data } = await supabase
            .from("user_profiles")
            .select("display_name, avatar_url, handle")
            .eq("user_id", nextUser.id)
            .maybeSingle();
          setProfile({
            displayName: (data?.display_name as string | null) ?? null,
            avatarUrl: (data?.avatar_url as string | null) ?? null,
            handle: (data?.handle as string | null) ?? null,
          });
        } else {
          setProfile(null);
        }
      })();
    });
    function onProfileUpdated() {
      void loadCurrentUser();
    }
    window.addEventListener("profile-updated", onProfileUpdated);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener("profile-updated", onProfileUpdated);
    };
  }, [supabase]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const el = menuRef.current;
      if (el && !el.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function signOut() {
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  if (loading || !user) {
    return null;
  }

  const avatarUrl =
    sanitizeExternalUrl(
      profile?.avatarUrl ??
      user.user_metadata?.avatar_url ??
      user.user_metadata?.picture ??
      null,
    );
  const name =
    profile?.displayName ??
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.email ??
    "User";

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-white/5"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="h-8 w-8 rounded-lg border border-white/10 object-cover"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15 text-sm font-medium text-brand">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium text-slate-300">{name}</p>
          {profile?.handle ? (
            <p className="truncate text-xs text-slate-500">@{profile.handle}</p>
          ) : null}
        </div>
        <ChevronDown className="h-4 w-4 text-slate-500" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-50 mb-2 min-w-[220px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0d1520] py-1 shadow-xl shadow-black/40"
        >
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-200 transition hover:bg-white/5"
          >
            <Settings className="h-4 w-4 shrink-0" />
            Settings
          </Link>
          {showAdminLink ? (
            <Link
              href="/admin"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-200 transition hover:bg-white/5"
            >
              <Shield className="h-4 w-4 shrink-0" />
              Admin
            </Link>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-400 transition hover:bg-red-500/10"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
