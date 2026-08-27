import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { KeyIcon } from './icons'

interface Props {
  userEmail: string | null
  /** vrai pour une invitation (premier accès), faux pour une récupération */
  invited: boolean
  onDone: () => void
  showToast: (msg: string, kind?: 'ok' | 'err') => void
}

/**
 * Arrivée par lien e-mail (invitation ou mot de passe oublié) : le mot de
 * passe se définit ici, avec confirmation, avant d'entrer dans l'app.
 */
export default function SetPasswordScreen({ userEmail, invited, onDone, showToast }: Props) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (pw.length < 6) {
      setError('6 caractères minimum.')
      return
    }
    if (pw !== pw2) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }
    setBusy(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password: pw })
      if (err) throw err
      showToast('Mot de passe défini ✓')
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de définir le mot de passe.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-logo">
        <img src="/icons/icon-192.png" alt="" />
        <h1>
          Carbu<em>volt</em>
        </h1>
      </div>
      <form className="card" onSubmit={submit}>
        <h2>{invited ? 'Bienvenue ! Choisis ton mot de passe' : 'Choisis un nouveau mot de passe'}</h2>
        <p className="settings-note">
          {invited ? (
            <>
              Ton accès {userEmail && <strong>{userEmail}</strong>} est prêt. Définis ton mot de
              passe pour entrer — il te servira pour les prochaines connexions.
            </>
          ) : (
            <>Définis le nouveau mot de passe {userEmail && <>du compte <strong>{userEmail}</strong> </>}pour continuer.</>
          )}
        </p>
        <label className="field">
          <span className="lbl">Mot de passe</span>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            placeholder="6 caractères minimum"
            autoFocus
          />
        </label>
        <label className="field">
          <span className="lbl">Répète le mot de passe</span>
          <input
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            autoComplete="new-password"
            minLength={6}
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary" disabled={busy || !pw || !pw2}>
          <KeyIcon /> {busy ? 'Un instant…' : 'Définir le mot de passe et entrer'}
        </button>
      </form>
    </div>
  )
}
