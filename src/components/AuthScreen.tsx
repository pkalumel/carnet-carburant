import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (!data.session) {
          setInfo('Compte créé ! Ouvre le lien de confirmation reçu par email, puis connecte-toi.')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible.')
    } finally {
      setBusy(false)
    }
  }

  async function forgotPassword() {
    setError(null)
    setInfo(null)
    if (!email) {
      setError('Indique d’abord ton email ci-dessus.')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      })
      if (error) throw error
      setInfo('Email envoyé — ouvre le lien reçu pour définir un nouveau mot de passe.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible.')
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
        <label className="field">
          <span className="lbl">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="field">
          <span className="lbl">Mot de passe</span>
          <div className="pw-wrap">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
            <button
              type="button"
              className="pw-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 3l18 18" />
                  <path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 8.6 4 9.8 6.5a1.2 1.2 0 0 1 0 1c-.5 1-1.4 2.4-2.7 3.6M6.6 6.6C4.5 8 3 10 2.2 11.5a1.2 1.2 0 0 0 0 1C3.4 15 7 19 12 19c1.6 0 3-.4 4.3-1" />
                  <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2.2 11.5C3.4 9 7 5 12 5s8.6 4 9.8 6.5a1.2 1.2 0 0 1 0 1C20.6 15 17 19 12 19s-8.6-4-9.8-6.5a1.2 1.2 0 0 1 0-1z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </label>
        <button className="btn btn-primary" disabled={busy}>
          {mode === 'signin' ? 'Se connecter' : 'Créer le compte'}
        </button>
        {error && <p className="form-error">{error}</p>}
        {info && <p className="form-error" style={{ color: 'var(--ok)' }}>{info}</p>}
      </form>
      <button
        className="auth-switch"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin')
          setError(null)
          setInfo(null)
        }}
        disabled={busy}
      >
        {mode === 'signin' ? 'Première fois ? Créer un compte' : 'Déjà un compte ? Se connecter'}
      </button>
      {mode === 'signin' && (
        <button className="auth-switch" onClick={() => void forgotPassword()} disabled={busy}>
          Mot de passe oublié ?
        </button>
      )}
    </div>
  )
}
