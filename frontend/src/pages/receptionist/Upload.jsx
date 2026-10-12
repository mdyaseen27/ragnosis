import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Field, Icon, toast } from '../../components/ui';
import { useLang } from '../../i18n';

export default function Upload() {
  const { t } = useLang();
  const [pq, setPq] = useState('');
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  useEffect(() => {
    if (!pq.trim()) { setPatients([]); return; }
    const t = setTimeout(async () => {
      try { const d = await api(`/hospital/patients?q=${encodeURIComponent(pq)}`); setPatients(d.patients); }
      catch (e) { toast(e.message, 'err'); }
    }, 300);
    return () => clearTimeout(t);
  }, [pq]);

  const submit = async (e) => {
    e.preventDefault();
    if (!patientId || !file) { toast('Pick a patient and a file.', 'err'); return; }
    setBusy(true); setDone('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('patient_id', patientId);
      const d = await api('/reports/upload', { method: 'POST', form });
      setDone(d.report.deduped
        ? 'This file was already analyzed for this patient — no duplicate created.'
        : `Analyzed in ${(d.report.processing_ms / 1000).toFixed(1)}s. It is now visible on the patient's dashboard.`);
      setFile(null); setPatientId(''); setPq('');
    } catch (ex) { toast(ex.message, 'err'); }
    setBusy(false);
  };

  return (
    <>
      <div className="pagehead"><div>
        <span className="eyebrow">Reception</span>
        <h1>{t('upload.title')}</h1>
        <p className="sub">Runs the same AI pipeline as a patient upload — the result appears on the patient's dashboard instantly.</p>
      </div></div>
      <div className="card">
        <form onSubmit={submit}>
          <Field label="Patient" hint="Type to search, then click the patient.">
            <input className="input" value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Patient name…" />
            {patients.length > 0 && (
              <div className="tablewrap" style={{ marginTop: 8 }}><table className="data"><tbody>
                {patients.slice(0, 6).map((p) => (
                  <tr key={p._id || p.id} onClick={() => { setPatientId(p._id || p.id); setPq(p.name); setPatients([]); }} style={{ cursor: 'pointer' }}>
                    <td><strong>{p.name}</strong></td><td className="small">{p.email}</td>
                  </tr>
                ))}
              </tbody></table></div>
            )}
            {patientId && <p className="small row mt"><Icon name="check" size={14} /> Selected: {pq}</p>}
          </Field>
          <Field label="Report file" hint="PDF, JPG or PNG, up to 15 MB.">
            <input className="input" type="file" accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setFile(e.target.files[0])} required />
          </Field>
          {done && <div className="form-ok" role="status">{done}</div>}
          <button className="btn" disabled={busy}><Icon name="upload" size={16} /> {busy ? 'Analyzing…' : 'Upload and analyze'}</button>
        </form>
      </div>
    </>
  );
}
