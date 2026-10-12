import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Empty, Icon, fmtDay, toast } from '../../components/ui';
import { useLang } from '../../i18n';

export default function Prescriptions() {
  const { t } = useLang();
  const [list, setList] = useState(null);

  useEffect(() => {
    api('/hospital/prescriptions').then((d) => setList(d.prescriptions)).catch((e) => { toast(e.message, 'err'); setList([]); });
  }, []);

  if (list === null) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <div className="pagehead"><div>
        <span className="eyebrow">Your medicines</span>
        <h1>{t('rx.title')}</h1>
        <p className="sub">Structured prescriptions written by your doctor — newest first.</p>
      </div></div>
      {list.length === 0 ? (
        <Empty icon="pill" title="No prescriptions yet"
          body="When your doctor writes a prescription during a visit, it will appear here instantly." />
      ) : list.map((p) => (
        <div className="card" key={p._id || p.id}>
          <div className="spread" style={{ marginBottom: 10 }}>
            <div className="row"><Icon name="calendar" size={16} /><h3 style={{ margin: 0 }}>{fmtDay(p.created_at)}</h3></div>
            <span className="small">Dr. {p.doctor_name || '—'}</span>
          </div>
          <div className="tablewrap"><table className="data">
            <thead><tr><th>Medicine</th><th>Dosage</th><th>Frequency</th><th>Duration</th><th>Instructions</th></tr></thead>
            <tbody>
              {(p.medicines || []).map((m, i) => (
                <tr key={i}>
                  <td><strong>{m.name}</strong></td><td>{m.dosage}</td><td>{m.frequency}</td>
                  <td className="num">{m.duration_days} days</td><td className="small">{m.instructions || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {p.diagnosis_note && <p className="small mt"><strong>Note from doctor:</strong> {p.diagnosis_note}</p>}
        </div>
      ))}
    </>
  );
}
