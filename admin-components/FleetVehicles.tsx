/**
 * FleetVehicles — vehicle management section for the Fleet admin page.
 *
 * DROP-IN USAGE (Next.js / React admin):
 *   import { FleetVehicles } from '@/components/fleet/FleetVehicles';
 *   // In your Fleet page:
 *   <FleetVehicles apiBase={process.env.NEXT_PUBLIC_API_URL} token={session.token} operatorId={session.operator_id} />
 *
 * PROPS
 *   apiBase    — e.g. "https://chauffering-app-production.up.railway.app/api/v1"
 *   token      — JWT bearer token (from session / auth context)
 *   operatorId — current user's operator_id (null for superadmin, will be sent in POST body)
 *   role       — current user's role (controls edit/create permissions)
 */

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
type Segment = 'ride' | 'business' | 'executive' | 'office_lux' | 'prime_lux';

interface Vehicle {
  id: string;
  operator_id: string | null;
  segment: Segment;
  plate: string;
  make: string;
  model: string;
  year: number;
  color: string | null;
  is_active: boolean;
  assigned_driver_id: string | null;
  created_at: string;
}

interface VehicleFormState {
  make: string;
  model: string;
  year: string;
  segment: Segment | '';
  plate: string;
  color: string;
  operator_id: string; // superadmin override
}

// ─── Segment badge colours ─────────────────────────────────────────────────────
const SEGMENT_STYLES: Record<Segment, { bg: string; text: string }> = {
  ride:       { bg: '#e0f2fe', text: '#0369a1' },
  business:   { bg: '#fef3c7', text: '#92400e' },
  executive:  { bg: '#ede9fe', text: '#5b21b6' },
  office_lux: { bg: '#d1fae5', text: '#065f46' },
  prime_lux:  { bg: '#fce7f3', text: '#9d174d' },
};

function SegmentBadge({ segment }: { segment: Segment }) {
  const style = SEGMENT_STYLES[segment] ?? { bg: '#f3f4f6', text: '#6b7280' };
  return (
    <span
      style={{
        background: style.bg,
        color: style.text,
        padding: '2px 10px',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '.4px',
        whiteSpace: 'nowrap',
      }}
    >
      {segment}
    </span>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}

function Modal({ open, onClose, children, title }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  if (!open) return null;
  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500,
      }}
    >
      <div
        style={{
          background: '#fff', borderRadius: 12, padding: '28px 32px',
          width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,.2)',
        }}
      >
        <h3 style={{ color: '#667eea', marginBottom: 20, fontSize: 17 }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface FleetVehiclesProps {
  apiBase: string;
  token: string;
  operatorId?: string | null;
  role?: string;
}

const EMPTY_FORM: VehicleFormState = {
  make: '', model: '', year: '', segment: '', plate: '', color: '', operator_id: '',
};

export function FleetVehicles({ apiBase, token, operatorId, role }: FleetVehiclesProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // modal state
  const [modalOpen, setModalOpen]   = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [form, setForm]             = useState<VehicleFormState>(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState<string | null>(null);

  const isSuperAdmin = role === 'superadmin' || role === 'platform_admin';
  const canEdit = isSuperAdmin || role === 'operator_admin';

  // ── Helpers ──────────────────────────────────────────────────────────────
  const authHeaders = useCallback((): HeadersInit => ({
    'Content-Type': 'application/json',
    Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
  }), [token]);

  const apiCall = useCallback(async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers: authHeaders(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json as { message?: string; error?: string }).message ?? (json as { error?: string }).error ?? res.statusText);
    return json as T;
  }, [apiBase, authHeaders]);

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadVehicles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiCall<{ data: Vehicle[] }>('GET', '/vehicles');
      setVehicles(res.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => { loadVehicles(); }, [loadVehicles]);

  // ── Modal open helpers ────────────────────────────────────────────────────
  function openAddModal() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, operator_id: operatorId ?? '' });
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(v: Vehicle) {
    setEditingId(v.id);
    setForm({
      make:        v.make,
      model:       v.model,
      year:        String(v.year),
      segment:     v.segment,
      plate:       v.plate,
      color:       v.color ?? '',
      operator_id: v.operator_id ?? '',
    });
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.make || !form.model || !form.year || !form.segment || !form.plate) {
      setFormError('Make, model, year, segment, and plate are required.');
      return;
    }
    const year = parseInt(form.year, 10);
    if (isNaN(year) || year < 2000 || year > 2027) {
      setFormError('Year must be between 2000 and 2027.');
      return;
    }

    const body: Record<string, unknown> = {
      make:    form.make.trim(),
      model:   form.model.trim(),
      year,
      segment: form.segment,
      plate:   form.plate.trim(),
    };
    if (form.color.trim()) body.color = form.color.trim();
    // operator_id: superadmin may override; regular admins rely on their server-side scope
    if (isSuperAdmin && form.operator_id.trim()) {
      body.operator_id = form.operator_id.trim();
    }

    setSaving(true);
    try {
      if (editingId) {
        await apiCall('PATCH', `/vehicles/${editingId}`, body);
      } else {
        await apiCall('POST', '/vehicles', body);
      }
      closeModal();
      await loadVehicles();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ── Computed stats ────────────────────────────────────────────────────────
  const stats = {
    total:      vehicles.length,
    assigned:   vehicles.filter(v => v.assigned_driver_id).length,
    active:     vehicles.filter(v => v.is_active).length,
    unassigned: vehicles.filter(v => !v.assigned_driver_id).length,
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937' }}>Fleet Vehicles</h2>
          {!loading && (
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
              {stats.total} vehicles · {stats.assigned} assigned · {stats.active} active
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadVehicles} disabled={loading} style={btnOutlineStyle}>
            {loading ? '…' : 'Refresh'}
          </button>
          {canEdit && (
            <button onClick={openAddModal} style={btnPrimaryStyle}>
              + Add Vehicle
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 16px', borderRadius: 8, marginBottom: 12, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Stats tiles */}
      {!loading && vehicles.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Total',      value: stats.total,      color: '#667eea' },
            { label: 'Assigned',   value: stats.assigned,   color: '#10b981' },
            { label: 'Unassigned', value: stats.unassigned, color: '#f59e0b' },
            { label: 'Active',     value: stats.active,     color: '#8b5cf6' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 16px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              {['Make / Model', 'Plate', 'Segment', 'Year', 'Color', 'Driver', 'Status', ...(canEdit ? ['Actions'] : [])].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: '#555', fontWeight: 600, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={canEdit ? 8 : 7} style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>
                  Loading vehicles…
                </td>
              </tr>
            ) : vehicles.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 8 : 7} style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>
                  No vehicles found. {canEdit && 'Click "+ Add Vehicle" to create one.'}
                </td>
              </tr>
            ) : (
              vehicles.map(v => (
                <tr key={v.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={tdStyle}>
                    <strong>{v.make}</strong>{' '}
                    <span style={{ color: '#6b7280' }}>{v.model}</span>
                  </td>
                  <td style={tdStyle}><code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{v.plate}</code></td>
                  <td style={tdStyle}><SegmentBadge segment={v.segment} /></td>
                  <td style={tdStyle}>{v.year}</td>
                  <td style={tdStyle}>{v.color ?? <span style={{ color: '#d1d5db' }}>—</span>}</td>
                  <td style={tdStyle}>
                    {v.assigned_driver_id
                      ? <span style={{ color: '#059669' }}>● {v.assigned_driver_id.slice(0, 8)}…</span>
                      : <span style={{ color: '#9ca3af' }}>Unassigned</span>}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: v.is_active ? '#10b981' : '#9ca3af', fontWeight: 500 }}>
                      {v.is_active ? '● Active' : '○ Inactive'}
                    </span>
                  </td>
                  {canEdit && (
                    <td style={tdStyle}>
                      <button onClick={() => openEditModal(v)} style={btnSmOutlineStyle}>
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Modal */}
      <Modal open={modalOpen} onClose={closeModal} title={editingId ? 'Edit Vehicle' : '+ Add Vehicle'}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <Field label="Make *">
              <input style={inputStyle} value={form.make} onChange={e => setForm(f => ({ ...f, make: e.target.value }))} placeholder="e.g. Mercedes-Benz" />
            </Field>
            <Field label="Model *">
              <input style={inputStyle} value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} placeholder="e.g. E 220 CDI" />
            </Field>
            <Field label="Year *">
              <input style={inputStyle} type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} placeholder="2024" min={2000} max={2027} />
            </Field>
            <Field label="Plate *">
              <input style={inputStyle} value={form.plate} onChange={e => setForm(f => ({ ...f, plate: e.target.value }))} placeholder="e.g. B-101-CHF" />
            </Field>
            <Field label="Segment *">
              <select style={inputStyle} value={form.segment} onChange={e => setForm(f => ({ ...f, segment: e.target.value as Segment | '' }))}>
                <option value="">— select —</option>
                <option value="ride">ride</option>
                <option value="business">business</option>
                <option value="executive">executive</option>
                <option value="office_lux">office_lux</option>
                <option value="prime_lux">prime_lux</option>
              </select>
            </Field>
            <Field label="Color">
              <input style={inputStyle} value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} placeholder="e.g. Black (optional)" />
            </Field>
          </div>

          {/* Superadmin operator override */}
          {isSuperAdmin && (
            <Field label="Operator ID (superadmin override)" style={{ marginBottom: 14 }}>
              <input style={inputStyle} value={form.operator_id} onChange={e => setForm(f => ({ ...f, operator_id: e.target.value }))} placeholder="Leave blank to use token operator" />
            </Field>
          )}

          {formError && (
            <div style={{ background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
              {formError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
            <button type="button" onClick={closeModal} style={btnOutlineStyle}>Cancel</button>
            <button type="submit" disabled={saving} style={btnPrimaryStyle}>
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Vehicle'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>{label}</label>
      {children}
    </div>
  );
}

// Shared inline styles (avoids Tailwind coupling so this works in any CSS setup)
const inputStyle: React.CSSProperties = {
  padding: '8px 12px', border: '2px solid #ddd', borderRadius: 6,
  fontSize: 14, fontFamily: 'inherit', width: '100%',
};
const tdStyle: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' };
const btnBase: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600,
  cursor: 'pointer', border: 'none', transition: 'opacity .2s',
};
const btnPrimaryStyle: React.CSSProperties = {
  ...btnBase, background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff',
};
const btnOutlineStyle: React.CSSProperties = {
  ...btnBase, background: 'none', border: '2px solid #667eea', color: '#667eea',
};
const btnSmOutlineStyle: React.CSSProperties = {
  ...btnOutlineStyle, padding: '4px 10px', fontSize: 12,
};
