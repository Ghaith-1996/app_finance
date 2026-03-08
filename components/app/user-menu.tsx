"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buttonStyles } from "@/components/ui/button";
import type { User } from "@supabase/supabase-js";

export function UserMenu() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u ?? null);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (loading || !user) {
    return null;
  }

  const avatarUrl =
    user.user_metadata?.avatar_url ??
    user.user_metadata?.picture ??
    null;
  const name =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.email ??
    "User";

  return (
    <div className="flex items-center gap-3">
      <div className="hidden items-center gap-2 md:flex">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="h-8 w-8 rounded-full border border-black/8 object-cover"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-black/8 bg-brand/15 text-sm font-medium text-brand">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="max-w-[120px] truncate text-sm text-slate-600">
          {name}
        </span>
      </div>
      <button
        type="button"
        onClick={signOut}
        className={buttonStyles({
          variant: "ghost",
          className: "text-slate-700 hover:bg-black/5 hover:text-slate-950",
        })}
      >
        Sign out
      </button>
    </div>
  );
}
