import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Empty, Field, Icon, Modal, fmtDay, toast } from '../../components/ui';
import { useLang } from '../../i18n';

const today = () => new Date().toISOString().slice(0, 10);

export default function Reminders() {
  const { t } = useLang();
  const [list, setList] = useState(null);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ medicine_name: '', times: '08:00, 20:00', start_date: today(), end_date: today() });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { const d = await api('/reminders'); setList(d.reminders); }
    catch (e) { toast(e.message, 'err'); setList([]); }
  };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      await api('/reminders', {
        method: 'POST',
        body: {
          medicine_name: f.medicine_name.trim(),
          times_utc: f.times.split(',').map((t) => t.trim()).filter(Boolean),
          start_date: f.start_date, end_date: f.end_date,
        },
      });
      toast('Reminder created.'); setShow(false); load();
    } catch (ex) { toast(ex.message, 'err'); }
    setBusy(false);
  };

  const mark = async (r, time, status) => {
    try {
      await api(`/reminders/${r._id || r.id}`, { method: 'PATCH', body: { taken: { date: today(), time, status } } });
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  const toggleActive = async (r) => {
    try { await api(`/reminders/${r._id || r.id}`, { method: 'PATCH', body: { active: !r.active } }); load(); }
    catch (e) { toast(e.message, 'err'); }
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete reminder for ${r.medicine_name}?`)) return;
    try { await api(`/reminders/${r._id || r.id}`, { method: 'DELETE' }); load(); }
    catch (e) { toast(e.message, 'err'); }
  };

  if (list === null) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <div className="pagehead">
        <div><span className="eyebrow">Stay on track</span><h1>{t('rem.title')}</h1><p className="sub">Mark each dose taken or skipped — your adherence is tracked automatically.</p></div>
        <button className="btn" onClick={() => setShow(true)}><Icon name="plus" size={16} /> New reminder</button>
      </div>
      {list.length === 0 ? (
        <Empty icon="bell" title="No reminders yet"
          body="Set dose times for a medicine and we'll nudge you here when each dose is due."
          action={<button className="btn" onClick={() => setShow(true)}>Create reminder</button>} />
      ) : (
        <div className="grid auto">
          {list.map((r) => {
            const id = r._id || r.id;
            const takenToday = (r.taken_log || []).filter((t) => t.date === today());
            return (
              <div className="card" key={id} style={{ opacity: r.active ? 1 : 0.6 }}>
                <div className="spread">
                  <div><h3 style={{ margin: '0 0 4px' }}>{r.medicine_name}</h3>
                    <span className="small">{fmtDay(r.start_date)} <Icon name="arrow" size={13} /> {fmtDay(r.end_date)}
                      {r.adherence_pct != null && <> · <span className="num">{Math.round(r.adherence_pct)}%</span> adherence</>}</span></div>
                  <div className="row">
                    <button className="btn ghost small" onClick={() => toggleActive(r)}>{r.active ? 'Pause' : 'Resume'}</button>
                    <button className="btn danger-ghost small" onClick={() => remove(r)}>Delete</button>
                  </div>
                </div>
                <div className="times mt">
                  {(r.times_utc || []).map((t) => {
                    const done = takenToday.find((x) => x.time === t);
                    return (
                      <span key={t} className="timechip">
                        <span className="num">{t}</span>{' '}
                        {done ? <span className="small">{done.status === 'taken' ? <><Icon name="check" size={13} /> taken</> : <><Icon name="x" size={13} /> skipped</>}</span> : (
                          <span className="row" style={{ display: 'inline-flex', gap: 4 }}>
                            <button className="btn small" style={{ minHeight: 28, padding: '2px 10px' }} onClick={() => mark(r, t, 'taken')}>Taken</button>
                            <button className="btn ghost small" style={{ minHeight: 28, padding: '2px 10px' }} onClick={() => mark(r, t, 'skipped')}>Skip</button>
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {show && (
        <Modal title="New reminder" onClose={() => setShow(false)}>
          <form onSubmit={create}>
            <Field label="Medicine name"><input className="input" value={f.medicine_name} onChange={(e) => setF({ ...f, medicine_name: e.target.value })} required /></Field>
            <Field label="Dose times (24h)" hint="Comma-separated, e.g. 08:00, 14:00, 20:00. Stored in UTC, shown in your timezone.">
              <input className="input" value={f.times} onChange={(e) => setF({ ...f, times: e.target.value })} required placeholder="08:00, 20:00" />
            </Field>
            <div className="grid cols-2">
              <Field label="Start date"><input className="input" type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} required /></Field>
              <Field label="End date"><input className="input" type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} required /></Field>
            </div>
            <button className="btn" style={{ width: '100%' }} disabled={busy}>{busy ? 'Saving…' : 'Create reminder'}</button>
          </form>
        </Modal>
      )}
    </>
  );
}
