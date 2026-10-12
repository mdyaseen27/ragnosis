import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Disclaimer, Field, fmtDay, Icon, Pill, toast } from '../../components/ui';

const blankRow = () => ({ name: '', dosage: '', frequency: '1-0-1', duration_days: '', instructions: '' });

// Reports are visible to the patient automatically — there is no approval
// step. This editor exists only so the treating doctor can correct a value
// the pipeline extracted wrong; saving recomputes score and summary.
function ReportCorrector({ report, onSaved }) {
  const [open, setOpen] = useState(false);
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState(false);
  const metrics = report.metrics || [];
  const corrections = report.validation?.corrections || [];

  const save = async () => {
    const list = Object.entries(edits)
      .filter(([, v]) => v !== '' && v != null)
      .map(([param, v]) => ({ param, value: Number(v) }));
    if (!list.length) { toast('Change at least one value first.', 'err'); return; }
    setBusy(true);
    try {
      await api(`/hospital/reports/${report.id || report._id}/validate`, { method: 'POST', body: { corrections: list } });
      toast('Corrections saved — score and summary updated.');
      setEdits({}); setOpen(false); onSaved();
    } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };

  return (
    <div style={{ borderTop: '1px solid var(--line)', padding: '8px 0' }}>
      <div className="kv" style={{ border: 0, padding: 0 }}>
        <span className="k">{report.file_name}</span>
        <span><span className="num">{Math.round(report.health_score)}</span> · {fmtDay(report.created_at)}</span>
      </div>
      {corrections.length > 0 && (
        <p className="small" style={{ color: 'var(--accent-strong)', margin: '4px 0 0' }}>
          Corrected by Dr. {report.validation.by_name}: {corrections.map((c) => `${c.param} ${c.old_value} → ${c.new_value}`).join('; ')}
        </p>
      )}
      <button type="button" className="btn ghost small" style={{ marginTop: 6 }} onClick={() => setOpen(!open)}>
        {open ? 'Close' : 'Correct values'}
      </button>
      {open && (
        <div className="mt">
          {metrics.length === 0 ? <p className="small">No extracted values on this report.</p> : (
            <>
              <div className="tablewrap"><table className="data">
                <thead><tr><th>Parameter</th><th>Value</th><th>Status</th><th>Corrected value</th></tr></thead>
                <tbody>
                  {metrics.map((m) => (
                    <tr key={m.param}>
                      <td>{m.param}</td>
                      <td className="num">{m.value} {m.unit}</td>
                      <td><Pill status={m.status} /></td>
                      <td><input className="input" style={{ maxWidth: 130 }} type="number" step="any"
                        placeholder={String(m.value)}
                        value={edits[m.param] ?? ''}
                        onChange={(e) => setEdits({ ...edits, [m.param]: e.target.value })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <button className="btn small mt" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save corrections'}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function PatientView() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([blankRow()]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setData(await api(`/hospital/patients/${id}`)); }
    catch (e) { toast(e.message, 'err'); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setRow = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const submit = async (e) => {
    e.preventDefault();
    const medicines = rows
      .filter((r) => r.name.trim())
      .map((r) => ({ ...r, name: r.name.trim(), duration_days: Number(r.duration_days) || 0 }));
    if (medicines.length === 0) { toast('Add at least one medicine.', 'err'); return; }
    setBusy(true);
    try {
      await api('/hospital/prescriptions', {
        method: 'POST',
        body: { patient_id: id, medicines, diagnosis_note: note.trim() || undefined },
      });
      toast('Prescription saved — the patient can see it now.');
      setRows([blankRow()]); setNote(''); load();
    } catch (ex) { toast(ex.message, 'err'); }
    setBusy(false);
  };

  if (!data) return <div className="center"><div className="spinner" /></div>;
  const p = data.patient || {};

  return (
    <>
      <div className="pagehead"><div>
        <span className="eyebrow">Patient record</span>
        <h1>{p.name}</h1>
        <p className="sub">{p.email} · {p.mobile || 'no mobile on file'}</p>
      </div></div>

      <div className="grid cols-2">
        <div className="card">
          <h3><Icon name="file" size={17} /> Recent reports</h3>
          {(data.reports || []).length === 0 ? <p className="small">No reports uploaded yet.</p> : (
            (data.reports || []).slice(0, 5).map((r) => (
              <ReportCorrector key={r.id || r._id} report={r} onSaved={load} />
            ))
          )}
        </div>
        <div className="card">
          <h3><Icon name="calendar" size={17} /> Upcoming appointments</h3>
          {(data.appointments || []).filter((a) => a.status === 'scheduled').length === 0
            ? <p className="small">Nothing scheduled.</p>
            : (data.appointments || []).filter((a) => a.status === 'scheduled').slice(0, 5).map((a) => (
              <div className="kv" key={a._id || a.id}>
                <span className="k num">{a.date} · {a.slot}</span><Pill status="Normal" />
              </div>
            ))}
        </div>
      </div>

      <div className="card mt">
        <h3><Icon name="pill" size={17} /> Prescription history</h3>
        {(data.prescriptions || []).length === 0 ? <p className="small">No prescriptions written yet.</p> : (
          <div className="tablewrap"><table className="data">
            <thead><tr><th>Date</th><th>Medicines</th></tr></thead>
            <tbody>
              {(data.prescriptions || []).slice(0, 6).map((pr) => (
                <tr key={pr._id || pr.id}>
                  <td className="small">{fmtDay(pr.created_at)}</td>
                  <td className="small">{(pr.medicines || []).map((m) => `${m.name} ${m.dosage} (${m.frequency})`).join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      <div className="card mt">
        <h3><Icon name="plus" size={17} /> Write prescription</h3>
        <form onSubmit={submit}>
          {rows.map((r, i) => (
            <div className="medrow" key={i}>
              <Field label={i === 0 ? 'Medicine' : ''}><input className="input" value={r.name} onChange={(e) => setRow(i, 'name', e.target.value)} placeholder="Paracetamol" required={i === 0} /></Field>
              <Field label={i === 0 ? 'Dosage' : ''}><input className="input" value={r.dosage} onChange={(e) => setRow(i, 'dosage', e.target.value)} placeholder="500 mg" /></Field>
              <Field label={i === 0 ? 'Frequency' : ''}><input className="input" value={r.frequency} onChange={(e) => setRow(i, 'frequency', e.target.value)} placeholder="1-0-1" /></Field>
              <Field label={i === 0 ? 'Days' : ''}><input className="input" type="number" min="1" value={r.duration_days} onChange={(e) => setRow(i, 'duration_days', e.target.value)} /></Field>
              <Field label={i === 0 ? 'Instructions' : ''}><input className="input" value={r.instructions} onChange={(e) => setRow(i, 'instructions', e.target.value)} placeholder="After food" /></Field>
              <div>{rows.length > 1 && <button type="button" className="btn danger-ghost small" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove row"><Icon name="x" size={16} /></button>}</div>
            </div>
          ))}
          <button type="button" className="btn ghost small" onClick={() => setRows([...rows, blankRow()])}><Icon name="plus" size={16} /> Add medicine</button>
          <div className="mt">
            <Field label="Note for patient (optional)" hint="Must not contain a definitive diagnosis claim.">
              <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Recheck CBC after 2 weeks." />
            </Field>
          </div>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : (<><Icon name="check" size={16} /> Save prescription</>)}</button>
        </form>
      </div>
      <div className="mt"><Disclaimer>Prescriptions are medical instructions from the treating doctor, not AI output.</Disclaimer></div>
    </>
  );
}
