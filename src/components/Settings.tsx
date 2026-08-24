import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useTheme, type ThemePref } from '../lib/theme'
import type { Fillup, Vehicle } from '../lib/types'
import VehicleManager from './VehicleManager'
import ShareManager from './ShareManager'
import { DownloadIcon, KeyIcon, LogoutIcon, ShieldIcon } from './icons'

interface Props {
  vehicles: Vehicle[]
  fillups: Fillup[]
  userId: string
  userEmail: string | null
  isAdmin: boolean
  onOpenAdmin: () => void
  onChanged: () => void
  showToast: (msg: string, kind?: 'ok' | 'err') => void
}

/** CSV « Excel FR » : séparateur ; virgule décimale, BOM UTF-8 */
function buildCsv(fillups: Fillup[], vehicles: Vehicle[]): string {
  const byId = (id: string) => vehicles.find((v) => v.id === id)
  const dec = (v: number | null) => (v == null ? '' : String(v).replace('.', ','))
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const rows = [
    'date;vehicule;carburant;energie;litres_ou_kwh;prix_total_eur;prix_unitaire_eur;compteur_km;plein_complet;lieu;notes;auteur',
    ...fillups
      .filter((f) => !f.is_draft)
      .map((f) =>
        [
          new Date(f.filled_at).toLocaleString('fr-FR'),
          esc(byId(f.vehicle_id)?.name ?? f.vehicle_id),
          esc(byId(f.vehicle_id)?.fuel ?? ''),
          f.energy === 'electric' ? 'recharge' : 'carburant',
          dec(f.liters),
          dec(f.total_price),
          dec(f.price_per_liter != null ? Math.round(f.price_per_liter * 1000) / 1000 : null),
          f.odometer_km ?? '',
          f.is_full ? 'oui' : 'non',
          esc(f.place ?? ''),
          esc(f.notes ?? ''),
          esc(f.created_by_email ?? ''),
        ].join(';'),
      ),
  ]
  return '﻿' + rows.join('\r\n')
}

export default function Settings({ vehicles, fillups, userId, userEmail, isAdmin, onOpenAdmin, onChanged, showToast }: Props) {
  const [theme, setTheme] = useTheme()
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const realCount = fillups.filter((f) => !f.is_draft).length

  function exportCsv() {
    const blob = new Blob([buildCsv(fillups, vehicles)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `carnet-carburant-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault()
    if (newPassword.length < 6) {
      showToast('6 caractères minimum', 'err')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setNewPassword('')
      showToast('Mot de passe modifié ✓')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Modification impossible', 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-grid">
      <VehicleManager vehicles={vehicles} fillups={fillups} userId={userId} onChanged={onChanged} showToast={showToast} />

      <div className="settings-aside">
      {isAdmin && (
        <section className="card">
          <h2>Administration</h2>
          <p className="settings-note">
            Comptes, activité et santé du service — réservé aux administrateurs.
          </p>
          <button className="btn-ghost" style={{ width: '100%' }} onClick={onOpenAdmin}>
            <ShieldIcon /> Ouvrir la console d’administration
          </button>
        </section>
      )}

      <section className="card">
        <h2>Données</h2>
        <p className="settings-note">
          {realCount === 0
            ? 'Aucun plein à exporter pour l’instant.'
            : realCount === 1
              ? '1 plein enregistré.'
              : `${realCount} pleins enregistrés.`}{' '}
          L’export CSV s’ouvre dans Excel, Numbers ou Google Sheets.
        </p>
        <button className="btn-ghost" style={{ width: '100%' }} onClick={exportCsv} disabled={realCount === 0}>
          <DownloadIcon /> Exporter tous les pleins en CSV
        </button>
      </section>

      <ShareManager
        vehicles={vehicles}
        userId={userId}
        userEmail={userEmail}
        showToast={showToast}
        onChanged={onChanged}
      />

      <section className="card">
        <h2>Apparence</h2>
        <div className="seg" role="radiogroup" aria-label="Thème">
          {(
            [
              ['auto', 'Auto'],
              ['light', 'Clair'],
              ['dark', 'Sombre'],
            ] as [ThemePref, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              className={theme === value ? 'active' : ''}
              onClick={() => setTheme(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="settings-note" style={{ marginTop: 10, marginBottom: 0 }}>
          « Auto » suit le réglage clair/sombre du téléphone.
        </p>
      </section>

      <section className="card">
        <h2>Compte</h2>
        <p className="settings-note">Connecté en tant que <strong>{userEmail ?? '—'}</strong></p>
        <form onSubmit={changePassword}>
          <label className="field">
            <span className="lbl">Nouveau mot de passe</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              placeholder="6 caractères minimum"
            />
          </label>
          <button className="btn-ghost" style={{ width: '100%' }} disabled={busy || newPassword.length === 0}>
            <KeyIcon /> Changer le mot de passe
          </button>
        </form>
        <button
          className="btn-ghost btn-danger"
          style={{ width: '100%', marginTop: 12 }}
          onClick={() => void supabase.auth.signOut()}
        >
          <LogoutIcon /> Se déconnecter
        </button>
      </section>
      </div>
    </div>
  )
}
