import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Empty, Icon, fmtDay, toast } from '../../components/ui';
import { useLang } from '../../i18n';

const STATUS_PILL = { scheduled: 'info', completed: 'normal', cancelled: 'unknown', no_show: 'high' };

export default function Today() {
  const { t } = useLang();
  const [list, setList] = useState(null);
  const date = new Date().toISOString().slice(0, 10);

  const load = async () => {
    try { const d = await api(`/hospital/appointments?date=${date}`); setList(d.appointments); }
    catch (e) { toast(e.message, 'err'); setList([]); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setStatus = async (a, status) => {
    try {
      await api(`/hospital/appointments/${a._id || a.id}`, { method: 'PATCH', body: { status } });
      toast(`Marked ${status.replace('_', ' ')}.`);
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  if (list === null) return <div className="center"><div className="spinner" /></div>;

  const scheduled = list.filter((a) => a.status === 'scheduled').length;
  const completed = list.filter((a) => a.status === 'completed').length;
  const missed = list.filter((a) => a.status === 'no_show' || a.status === 'cancelled').length;

  return (
    <>
      <div className="pagehead"><div>
        <span className="eyebrow">Today · {fmtDay(date)}</span>
        <h1>{t('today.title')}</h1>
        <p className="sub">15-minute slots, 09:00–13:00 and 17:00–21:00.</p>
      </div></div>
      <div className="grid auto">
        <div className="stat"><div className="v num">{scheduled}</div><div className="l">Scheduled</div></div>
        <div className="stat"><div className="v num">{completed}</div><div className="l">Completed</div></div>
        <div className="stat"><div className="v num">{missed}</div><div className="l">No-shows &amp; cancelled</div></div>
      </div>
      <div className="mt">
        {list.length === 0 ? (
          <Empty icon="calendar" title="A quiet day" body="No appointments are booked for today. New bookings from your receptionist will appear here." />
        ) : (
          <div className="card"><div className="tablewrap"><table className="data">
            <thead><tr><th>Slot</th><th>Patient</th><th>Status</th><th>Notes</th><th></th></tr></thead>
            <tbody>
              {list.map((a) => {
                const id = a._id || a.id;
                return (
                  <tr key={id}>
                    <td className="num">{a.slot}</td>
                    <td><Link to={`/doctor/patients/${a.patient_id}`}>{a.patient_name || 'Patient'}</Link></td>
                    <td><span className={`pill ${STATUS_PILL[a.status] || 'unknown'}`}><span className="dot" />{a.status.replace('_', ' ')}</span></td>
                    <td className="small">{a.notes || '—'}</td>
                    <td>
                      {a.status === 'scheduled' && (
                        <div className="row">
                          <button className="btn ghost small" onClick={() => setStatus(a, 'completed')}><Icon name="check" size={14} />Done</button>
                          <button className="btn ghost small" onClick={() => setStatus(a, 'no_show')}><Icon name="clock" size={14} />No-show</button>
                          <button className="btn danger-ghost small" onClick={() => setStatus(a, 'cancelled')}><Icon name="x" size={14} />Cancel</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div></div>
        )}
      </div>
    </>
  );
}
