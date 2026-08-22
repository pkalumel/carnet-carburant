import { createClient } from '@supabase/supabase-js'

// Type d'arrivée par lien e-mail (#type=invite|recovery|…), capturé AVANT
// que le client ne consomme et n'efface le fragment d'URL. Sert à imposer
// la définition du mot de passe avant d'entrer dans l'application.
const hashParams = new URLSearchParams(window.location.hash.slice(1))
export const emailLinkType = hashParams.get('type')

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
