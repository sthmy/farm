alter table users add column username_lc text;
update users set username_lc = lower(username) where username_lc is null;
create unique index if not exists idx_users_lc on users (username_lc);

alter table users add column perks text not null default '{}';
alter table users add column fails integer not null default 0;
alter table users add column lock_until integer not null default 0;

create table if not exists signups (
  ip text not null,
  ts integer not null
);

create index if not exists idx_trades_ts on trades (ts desc);
create index if not exists idx_signups on signups (ip, ts);
