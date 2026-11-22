-- المرحلة 17: منع النشر بسبب السن أو انتهاك الحقوق. شغّله بعد phase16.sql
alter table public.profiles add column if not exists publish_ban text check (publish_ban in ('age','copyright'));
create or replace function public.can_post(p_uid uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from profiles p where p.id=p_uid and p.publish_ban is null and (p.role='admin' or p.can_publish
    or (p.birth_date is not null and p.birth_date <= (current_date - interval '18 years')::date))) $$;
