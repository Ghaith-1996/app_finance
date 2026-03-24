-- Community social features: posts, comments, ticker tags, user profiles

-- User profiles for display names and avatars
create table if not exists user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  handle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_user_profiles_handle on user_profiles(handle) where handle is not null;

alter table user_profiles enable row level security;

create policy "Users can read all profiles" on user_profiles for select to authenticated using (true);
create policy "Users can insert own profile" on user_profiles for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update own profile" on user_profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Community posts
create table if not exists community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_community_posts_created on community_posts(created_at desc);
create index if not exists idx_community_posts_user on community_posts(user_id);

alter table community_posts enable row level security;

create policy "Authenticated can read posts" on community_posts for select to authenticated using (true);
create policy "Users can create own posts" on community_posts for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update own posts" on community_posts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own posts" on community_posts for delete to authenticated using (auth.uid() = user_id);

-- Ticker tags on posts
create table if not exists community_post_tickers (
  post_id uuid not null references community_posts(id) on delete cascade,
  ticker text not null check (ticker ~ '^[A-Z0-9.\-]{1,10}$'),
  primary key (post_id, ticker)
);

create index if not exists idx_community_post_tickers_ticker on community_post_tickers(ticker);

alter table community_post_tickers enable row level security;

create policy "Authenticated can read post tickers" on community_post_tickers for select to authenticated using (true);
create policy "Users can insert own post tickers" on community_post_tickers for insert to authenticated
  with check (exists (select 1 from community_posts where id = post_id and user_id = auth.uid()));
create policy "Users can delete own post tickers" on community_post_tickers for delete to authenticated
  using (exists (select 1 from community_posts where id = post_id and user_id = auth.uid()));

-- Comments on posts
create table if not exists community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_community_comments_post on community_comments(post_id, created_at asc);
create index if not exists idx_community_comments_user on community_comments(user_id);

alter table community_comments enable row level security;

create policy "Authenticated can read comments" on community_comments for select to authenticated using (true);
create policy "Users can create own comments" on community_comments for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update own comments" on community_comments for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own comments" on community_comments for delete to authenticated using (auth.uid() = user_id);

-- Auto-update updated_at triggers
create or replace function update_updated_at_column() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_user_profiles_updated before update on user_profiles for each row execute function update_updated_at_column();
create trigger trg_community_posts_updated before update on community_posts for each row execute function update_updated_at_column();
create trigger trg_community_comments_updated before update on community_comments for each row execute function update_updated_at_column();
