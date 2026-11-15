import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const url = Deno.env.get('SUPABASE_URL')!;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const me = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user } } = await me.auth.getUser();
  if (!user) return j({ error: 'unauthorized' }, 401);
  const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: p } = await sb.from('profiles').select('role,banned').eq('id', user.id).single();
  if (!p || p.role !== 'admin' || p.banned) return j({ error: 'غير مصرح' }, 403);

  const b = await req.json();
  const log = (action: string, target?: string) => sb.from('admin_log').insert({ admin: user.id, action, target });

  if (b.action === 'list') {
    const { data, error } = await sb.from('profiles')
      .select('id,username,full_name,gender,birth_date,phone,guardian_phone,avatar_url,role,banned,ch_xp,ch_wins,ch_played,created_at')
      .order('created_at', { ascending: false }).limit(1000);
    return error ? j({ error: error.message }, 500) : j({ users: data });
  }

  if (b.action === 'notify') {
    const title = String(b.title ?? '').trim().slice(0, 60), body = String(b.body ?? '').trim().slice(0, 300);
    if (!title || !body) return j({ error: 'اكتب العنوان والرسالة' }, 400);
    const all = b.ids === 'all';
    const ids: string[] = all ? [] : (Array.isArray(b.ids) ? b.ids.map(String).slice(0, 500) : []);
    if (!all && !ids.length) return j({ error: 'حدّد مستخدمين' }, 400);
    const rows = all ? [{ to_user: null, title, body, by_admin: user.id }] : ids.map((id) => ({ to_user: id, title, body, by_admin: user.id }));
    const { error } = await sb.from('notices').insert(rows);
    if (error) return j({ error: error.message }, 500);
    let sent = 0, perr = '';
    const pub = Deno.env.get('VAPID_PUBLIC_KEY'), prv = Deno.env.get('VAPID_PRIVATE_KEY');
    if (pub && prv) {
      try {
        const webpush = (await import('npm:web-push@3.6.7')).default;
        let subj = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
        if (!/^(mailto:|https:)/.test(subj)) subj = 'mailto:' + subj;
        webpush.setVapidDetails(subj, pub, prv);
        let q = sb.from('push_subs').select('*');
        if (!all) q = q.in('user_id', ids);
        const { data: subs } = await q;
        const payload = JSON.stringify({ title: '📢 ' + title, body, tag: 'adm-' + Date.now(), url: './' });
        await Promise.all((subs ?? []).map(async (s) => {
          try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 }); sent++; }
          catch (e) { if ([404, 410].includes((e as { statusCode?: number }).statusCode ?? 0)) await sb.from('push_subs').delete().eq('endpoint', s.endpoint); }
        }));
      } catch (e) { perr = String((e as Error).message ?? e); }
    }
    await log('notify');
    return j({ ok: true, push: sent, push_error: perr || undefined });
  }

  if (b.action === 'reports') {
    const { data: rs } = await sb.from('reports').select('id,reporter,reported,msg_id,reason').eq('st', 'open').order('id', { ascending: false }).limit(50);
    const list = rs ?? [];
    const uids = [...new Set(list.flatMap((r) => [r.reporter, r.reported]))];
    const mids = list.map((r) => r.msg_id).filter(Boolean);
    const { data: ps } = await sb.from('profiles').select('id,username,full_name').in('id', uids.length ? uids : ['00000000-0000-0000-0000-000000000000']);
    const { data: ms } = await sb.from('messages').select('id,kind,body,img_path').in('id', mids.length ? mids : [-1]);
    const nm = (id: string) => { const p = (ps ?? []).find((x) => x.id === id); return p ? p.full_name + ' (@' + p.username + ')' : 'غير معروف'; };
    const out = [];
    for (const r of list) {
      const m = (ms ?? []).find((x) => x.id === r.msg_id);
      let img: string | null = null;
      if (m && m.img_path) { const s = await sb.storage.from('chat').createSignedUrl(m.img_path, 600); img = s.data ? s.data.signedUrl : null; }
      out.push({ id: r.id, reported: r.reported, reporter: nm(r.reporter), reported_name: nm(r.reported), reason: r.reason, kind: m ? m.kind : null, body: m ? m.body : null, img });
    }
    return j({ reports: out });
  }
  if (b.action === 'report_close') {
    await sb.from('reports').update({ st: 'closed' }).eq('id', Number(b.rid));
    await log('report_close');
    return j({ ok: true });
  }

  const id = String(b.id ?? '');
  if (!id || id === user.id) return j({ error: 'طلب غير صالح' }, 400);
  const { data: t } = await sb.from('profiles').select('role').eq('id', id).single();
  if (!t || t.role === 'admin') return j({ error: 'لا يمكن التعديل على حساب مدير' }, 400);

  if (b.action === 'ban' || b.action === 'unban') {
    const ban = b.action === 'ban';
    await sb.from('profiles').update({ banned: ban }).eq('id', id);
    const { error } = await sb.auth.admin.updateUserById(id, { ban_duration: ban ? '876000h' : 'none' });
    await log(b.action, id);
    return error ? j({ error: error.message }, 500) : j({ ok: true });
  }
  if (b.action === 'reset') {
    if (String(b.password ?? '').length < 6) return j({ error: 'كلمة المرور قصيرة' }, 400);
    const { error } = await sb.auth.admin.updateUserById(id, { password: String(b.password) });
    await log('reset_password', id);
    return error ? j({ error: error.message }, 500) : j({ ok: true });
  }
  if (b.action === 'delete') {
    const { error } = await sb.auth.admin.deleteUser(id);
    await log('delete', id);
    return error ? j({ error: error.message }, 500) : j({ ok: true });
  }
  return j({ error: 'action غير معروف' }, 400);
});
