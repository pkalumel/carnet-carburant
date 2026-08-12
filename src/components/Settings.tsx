import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Fillup, Vehicle } from '../lib/types'
import VehicleManager from './VehicleManager'

interface Props {
  vehicles: Vehicle[]
  fillups: Fillup[]
  userEmail: string | null
  onChanged: () => void
  showToast: (msg: string, kind?: 'ok' | 'err') => void
}

/** CSV « Excel FR » : séparateur ; virgule décimale, BOM UTF-8 */
function buildCsv(fillups: Fillup[], vehicles: Vehicle[]): string {
  const name = (id: string) => vehicles.find((v) => v.id === id)?.name ?? id
  const dec = (v: number | null) => (v == null ? '' : String(v).replace('.', ','))
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const rows = [
    'date;vehicule;litres;prix_total_eur;prix_litre_eur;compteur_km;plein_complet;notes;auteur',
    ...fillups
      .filter((f) => !f.is_draft)
      .map((f) =>
        [
          new Date(f.filled_at).toLocaleString('fr-FR'),
          esc(name(f.vehicle_id)),
          dec(f.liters),
          dec(f.total_price),
          dec(f.price_per_liter != null ? Math.round(f.price_per_liter * 1000) / 1000 : null),
          f.odometer_km ?? '',
          f.is_full ? 'oui' : 'non',
          esc(f.notes ?? ''),
          esc(f.created_by_email ?? ''),
        ].join(';'),
      ),
  ]
  return '﻿' + rows.join('\r\n')
}

export default function Settings({ vehicles, fillups, userEmail, onChanged, showToast }: Props) {
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
    <>
      <VehicleManager vehicles={vehicles} fillups={fillups} onChanged={onChanged} showToast={showToast} />

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
          Exporter tous les pleins en CSV
        </button>
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
            Changer le mot de passe
          </button>
        </form>
        <button
          className="btn-ghost btn-danger"
          style={{ width: '100%', marginTop: 12 }}
          onClick={() => void supabase.auth.signOut()}
        >
          Se déconnecter
        </button>
      </section>
    </>
  )
}
