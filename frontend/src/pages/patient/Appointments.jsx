import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Empty, Field, fmtDay, Icon, toast } from '../../components/ui';
import { useLang } from '../../i18n';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Appointments() {
  const { t } = useLang();
  const { user } = useAuth();
  const [doctors, setDoctors] = useState([]);
  const [appts, setAppts] = useState(null);
  const [f, setF] = useState({ doctor_id: '', date: todayStr(), slot: '', notes: '' });
  const [slots, setSlots] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadAppts = useCallback(async () => {
    try { const d = await api('/hospital/appointments'); setAppts(d.appointments); }
    catch (e) { toast(e.message, 'err'); setAppts([]); }
  }, []);

  useEffect(() => {
    // Only real doctor accounts have bookable schedules — the directory's
    // demo entries are referral suggestions, not bookable doctors.
    api('/hospital/doctors')
      .then((d) => setDoctors(d.doctors.filter((x) => !x.is_demo)))
      .catch((e) => toast(e.message, 'err'));
    loadAppts();
  }, [loadAppts]);

  useEffect(() => {
    if (!f.doctor_id || !f.date) { setSlots(null); return; }
    api(`/hospital/doctors/${f.doctor_id}/slots?date=${f.date}`)
      .then((d) => setSlots(d.slots))
      .catch((e) => { toast(e.message, 'err'); setSlots(null); });
  }, [f.doctor_id, f.date]);

  const docName = (a) => {
    if (a.doctor_name) {
      const d = doctors.find((x) => (x._id || x.id) === a.doctor_id);
      return d ? `${a.doctor_name} · ${d.specialization}` : a.doctor_name;
    }
    const d = doctors.find((x) => (x._id || x.id) === a.doctor_id);
    return d ? `${d.name} · ${d.specialization}` : 'Doctor';
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!f.slot) { toast('Pick a free slot.', 'err'); return; }
    setBusy(true);
    try {
      await api('/hospital/appointments', {
        method: 'POST',
        body: { doctor_id: f.doctor_id, patient_id: user.id, date: f.date, slot: f.slot, notes: f.notes.trim() || undefined },
      });
      toast('Appointment booked.');
      setF({ ...f, slot: '', notes: '' });
      loadAppts();
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

  const cancel = async (a) => {
    if (!window.confirm(`Cancel your appointment on ${a.date} at ${a.slot}?`)) return;
    try {
      await api(`/hospital/appointments/${a._id || a.id}`, { method: 'PATCH', body: { status: 'cancelled' } });
      toast('Appointment cancelled.');
      loadAppts();
    } catch (e) { toast(e.message, 'err'); }
  };

  const upcoming = (appts || []).filter((a) => a.status === 'scheduled');
  const past = (appts || []).filter((a) => a.status !== 'scheduled');

  return (
    <>
      <div className="pagehead"><div>
        <span className="eyebrow">Care</span>
        <h1>{t('appts.title')}</h1>
        <p className="sub">{t('appts.sub')}</p>
      </div></div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('appts.bookTitle')}</h3>
        <form onSubmit={submit}>
          <div className="grid cols-2">
            <Field label={t('appts.doctor')}>
              <select className="select" value={f.doctor_id} onChange={(e) => setF({ ...f, doctor_id: e.target.value, slot: '' })} required>
                <option value="">Select doctor…</option>
                {doctors.map((d) => <option key={d._id || d.id} value={d._id || d.id}>{d.name} · {d.specialization}</option>)}
              </select>
            </Field>
            <Field label={t('appts.date')}><input className="input" type="date" min={todayStr()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value, slot: '' })} required /></Field>
          </div>
          <Field label={t('appts.note')} hint='e.g. "follow-up for my CBC report"'>
            <input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </Field>
          <Field label={t('appts.slot')}>
            {!slots ? <p className="small">{t('appts.pickDoctor')}</p> : (
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
          <button className="btn" disabled={busy || !f.slot}>{busy ? '…' : (<><Icon name="calendar" size={16} /> {t('appts.bookBtn')}</>)}</button>
        </form>
      </div>

      <div className="card mt">
        <h3 style={{ marginTop: 0 }}>{t('appts.upcoming')}</h3>
        {appts === null ? <div className="center"><div className="spinner" /></div>
          : upcoming.length === 0 ? <p className="small">{t('appts.none')}</p>
          : upcoming.map((a) => (
            <div className="kv" key={a._id || a.id}>
              <span className="k">{docName(a)}<br />
                <span className="small">{fmtDay(a.date)} · {a.slot}{a.notes ? ` · ${a.notes}` : ''}</span></span>
              <button className="btn danger-ghost small" onClick={() => cancel(a)}>{t('appts.cancel')}</button>
            </div>
          ))}
      </div>

      {past.length > 0 && (
        <div className="card mt">
          <h3 style={{ marginTop: 0 }}>{t('appts.history')}</h3>
          {past.map((a) => (
            <div className="kv" key={a._id || a.id}>
              <span className="k">{docName(a)}<br />
                <span className="small">{fmtDay(a.date)} · {a.slot}</span></span>
              <span className="small" style={{ textTransform: 'capitalize' }}>{a.status.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
