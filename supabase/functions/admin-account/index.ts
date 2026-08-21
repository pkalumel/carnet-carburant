// Actions d'administration sur les comptes : suppression, ban, unban.
// Seule cette fonction manipule la clé service_role (injectée par la
// plateforme) ; l'appelant est authentifié par son JWT puis contrôlé
// via la RPC is_admin().
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
}

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { error: 'méthode non autorisée' })

  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: userData } = await caller.auth.getUser()
  const me = userData?.user
  if (!me) return reply(401, { error: 'non authentifié' })
  const { data: ok } = await caller.rpc('is_admin')
  if (!ok) return reply(403, { error: 'accès réservé aux administrateurs' })

  let action: string, target: string
  try {
    ;({ action, user_id: target } = await req.json())
  } catch {
    return reply(400, { error: 'corps JSON invalide' })
  }
  if (!['delete', 'ban', 'unban'].includes(action) || typeof target !== 'string') {
    return reply(400, { error: 'action ou user_id invalide' })
  }
  if (target === me.id) return reply(400, { error: 'impossible de cibler son propre compte' })
  const { data: targetAdmin } = await admin
    .from('admins')
    .select('user_id')
    .eq('user_id', target)
    .maybeSingle()
  if (targetAdmin) return reply(403, { error: 'impossible de cibler un administrateur' })

  try {
    if (action === 'delete') {
      // Le storage ne cascade pas : purger les photos avant deleteUser
      // (ensuite vehicles -> fillups tombent par FK on delete cascade).
      const { data: rows, error } = await admin
        .from('fillups')
        .select('photo_path, vehicles!inner(user_id)')
        .eq('vehicles.user_id', target)
        .not('photo_path', 'is', null)
      if (error) throw new Error(error.message)
      const paths = (rows ?? []).map((r) => r.photo_path as string)
      for (let i = 0; i < paths.length; i += 100) {
        const { error: rmErr } = await admin.storage
          .from('pump-photos')
          .remove(paths.slice(i, i + 100))
        if (rmErr) throw new Error(rmErr.message)
      }
      const { error: delErr } = await admin.auth.admin.deleteUser(target)
      if (delErr) throw new Error(delErr.message)
    } else {
      const { error: banErr } = await admin.auth.admin.updateUserById(target, {
        ban_duration: action === 'ban' ? '87600h' : 'none',
      })
      if (banErr) throw new Error(banErr.message)
      if (action === 'ban') {
        // Sans révocation, le banni garde son access token ~1 h.
        await admin.auth.admin.signOut(target, 'global')
      }
    }
    return reply(200, { ok: true })
  } catch (e) {
    return reply(500, { error: e instanceof Error ? e.message : String(e) })
  }
})
