import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Empty, Field, Icon, toast } from '../../components/ui';
import { useLang } from '../../i18n';

const todayStr = () => new Date().toISOString().slice(0, 10);
const PILL = { scheduled: 'info', completed: 'normal', cancelled: 'unknown', no_show: 'high' };

export default function Bookings() {
  const { t } = useLang();
  const [date, setDate] = useState(todayStr());
  const [list, setList] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await api(`/hospital/appointments?date=${date}`);
      setList(d.appointments);
    } catch (e) { toast(e.message, 'err'); setList([]); }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const cancel = async (a) => {
    if (!window.confirm(`Cancel the ${a.slot} appointment for ${a.patient_name || 'this patient'}?`)) return;
    try {
      await api(`/hospital/appointments/${a._id || a.id}`, { method: 'PATCH', body: { status: 'cancelled' } });
      toast('Appointment cancelled.');
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  return (
    <>
      <div className="pagehead"><div>
        <span className="eyebrow">Front desk</span>
        <h1>{t('bookings.title')}</h1>
        <p className="sub">{t('bookings.sub')}</p>
      </div></div>
      <div className="card">
        <Field label={t('common.date')}>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 240 }} />
        </Field>
        {list === null ? <div className="center"><div className="spinner" /></div>
          : list.length === 0 ? (
            <Empty icon="calendar" title="No bookings" body="You have no bookings on this date. Use Book appointment to add one." />
          ) : (
            <div className="tablewrap"><table className="data">
              <thead><tr><th>Slot</th><th>Patient</th><th>Doctor</th><th>Status</th><th>Notes</th><th></th></tr></thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a._id || a.id}>
                    <td className="num">{a.slot}</td>
                    <td><strong>{a.patient_name || 'Patient'}</strong></td>
                    <td>{a.doctor_name || 'Doctor'}</td>
                    <td><span className={`pill ${PILL[a.status] || 'unknown'}`}><span className="dot" />{a.status.replace('_', ' ')}</span></td>
                    <td className="small">{a.notes || '—'}</td>
                    <td>{a.status === 'scheduled' && (
                      <button className="btn danger-ghost small" onClick={() => cancel(a)}><Icon name="x" size={14} /> Cancel</button>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
      </div>
    </>
  );
}
