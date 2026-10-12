import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Field, Icon, toast } from '../../components/ui';
import { useLang } from '../../i18n';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Book() {
  const { t } = useLang();
  const { user } = useAuth();
  const [doctors, setDoctors] = useState([]);
  const [pq, setPq] = useState('');
  const [patients, setPatients] = useState([]);
  const [f, setF] = useState({ doctor_id: '', patient_id: '', date: todayStr(), slot: '', notes: '' });
  const [slots, setSlots] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/hospital/doctors').then((d) => {
      // The directory also lists demo doctors (referral suggestions) —
      // those have no bookable schedule. Only real doctor accounts are.
      const bookable = d.doctors.filter((x) => !x.is_demo);
      setDoctors(bookable);
      if (user?.linked_doctor_id) {
        setF((s) => ({ ...s, doctor_id: user.linked_doctor_id }));
      }
    }).catch((e) => toast(e.message, 'err'));
  }, [user]);

  useEffect(() => {
    if (!pq.trim()) { setPatients([]); return; }
    const t = setTimeout(async () => {
      try { const d = await api(`/hospital/patients?q=${encodeURIComponent(pq)}`); setPatients(d.patients); }
      catch (e) { toast(e.message, 'err'); }
    }, 300);
    return () => clearTimeout(t);
  }, [pq]);

  useEffect(() => {
    if (!f.doctor_id || !f.date) { setSlots(null); return; }
    api(`/hospital/doctors/${f.doctor_id}/slots?date=${f.date}`)
      .then((d) => setSlots(d.slots))
      .catch((e) => { toast(e.message, 'err'); setSlots(null); });
  }, [f.doctor_id, f.date]);

  const submit = async (e) => {
    e.preventDefault();
    if (!f.patient_id || !f.slot) { toast('Pick a patient and a free slot.', 'err'); return; }
    setBusy(true);
    try {
      await api('/hospital/appointments', {
        method: 'POST',
        body: { doctor_id: f.doctor_id, patient_id: f.patient_id, date: f.date, slot: f.slot, notes: f.notes.trim() || undefined },
      });
      toast('Appointment booked.');
      setF({ ...f, patient_id: '', slot: '', notes: '' }); setPq('');
      const d = await api(`/hospital/doctors/${f.doctor_id}/slots?date=${f.date}`);
      setSlots(d.slots);
    } catch (ex) {
      if (ex.code === 'CONFLICT' && ex.free_slots) {
        toast('That slot was just taken — pick one of the highlighted free slots.', 'err');
        setSlots(ex.free_slots.map((s) => ({ time: s, available: true })));
      } else toast(ex.message, 'err');
    }
    setBusy(false);
  };

  return (
    <>
      <div className="pagehead"><div>
        <span className="eyebrow">New appointment</span>
        <h1>{t('book.title')}</h1>
        <p className="sub">Book a patient with any doctor in the hospital.</p>
      </div></div>
      <div className="card">
        <form onSubmit={submit}>
          <Field label="Doctor" hint={user?.linked_doctor_id ? 'Defaults to your desk doctor — change it freely.' : undefined}>
            <select className="select" value={f.doctor_id} onChange={(e) => setF({ ...f, doctor_id: e.target.value, slot: '' })} required>
              <option value="">Select doctor…</option>
              {doctors.map((d) => <option key={d._id || d.id} value={d._id || d.id}>{d.name} · {d.specialization}</option>)}
            </select>
          </Field>
          <Field label={t('book.patient')} hint="Type to search registered patients.">
            <input className="input" value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Patient name…" />
            {patients.length > 0 && (
              <div className="tablewrap mt"><table className="data"><tbody>
                {patients.slice(0, 6).map((p) => (
                  <tr key={p._id || p.id} onClick={() => { setF({ ...f, patient_id: p._id || p.id }); setPq(p.name); setPatients([]); }} style={{ cursor: 'pointer' }}>
                    <td><strong>{p.name}</strong></td><td className="small">{p.email}</td><td className="num small">{p.mobile || '—'}</td>
                  </tr>
                ))}
              </tbody></table></div>
            )}
            {f.patient_id && <p className="small" style={{ color: 'var(--primary-deep)', fontWeight: 700 }}>Selected: {pq}</p>}
          </Field>
          <div className="grid cols-2">
            <Field label="Date"><input className="input" type="date" min={todayStr()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value, slot: '' })} required /></Field>
            <Field label="Note (optional)" hint='e.g. "fasting required"'><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          </div>
          <Field label="Slot">
            {!slots ? <p className="small">Pick a doctor and date to see free slots.</p> : (
              <div className="slotgrid" role="radiogroup" aria-label="Time slots">
                {slots.map((s) => (
                  <button key={s.time} type="button" role="radio" aria-checked={f.slot === s.time}
                    className={`slot${f.slot === s.time ? ' sel' : ''}`}
                    disabled={!s.available} onClick={() => setF({ ...f, slot: s.time })}>
                    {s.time}
                  </button>
                ))}
              </div>
            )}
          </Field>
          <button className="btn" disabled={busy}>{busy ? 'Booking…' : (<><Icon name="calendar" size={16} /> Book appointment</>)}</button>
        </form>
      </div>
    </>
  );
}
