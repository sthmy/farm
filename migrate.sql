-- если база уже создана раньше, выполнить только это:
alter table users add column perks text not null default '{}';
