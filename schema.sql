create table if not exists users (
  id integer primary key autoincrement,
  username text not null unique,
  pass_hash text not null,
  salt text not null,
  cash real not null default 10,
  peak real not null default 10,
  trades integer not null default 0,
  last_trade integer not null default 0,
  last_grant integer not null default 0,
  created_at integer not null
);

create table if not exists holdings (
  user_id integer not null,
  asset text not null,
  qty real not null default 0,
  avg real not null default 0,
  primary key (user_id, asset)
);

create table if not exists trades (
  id integer primary key autoincrement,
  user_id integer not null,
  asset text not null,
  side text not null,
  qty real not null,
  price real not null,
  ts integer not null
);

create index if not exists idx_trades_user on trades (user_id, ts desc);
create index if not exists idx_users_peak on users (peak desc);
