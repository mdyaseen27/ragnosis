import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { BandPill, Disclaimer, fmtDate, Icon, Pill, ScoreRing, toast } from '../../components/ui';
import { useLang } from '../../i18n';

export default function ReportDetail() {
  const { t } = useLang();
  const { id } = useParams();
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/reports/${id}`).then((d) => setR(d.report)).catch((e) => toast(e.message, 'err'));
  }, [id]);

  const reprocess = async () => {
    setBusy(true);
    try {
      await api(`/reports/${id}/reprocess`, { method: 'POST', body: {} });
      const d = await api(`/reports/${id}`);
      setR(d.report);
      toast('Analysis re-run with the latest pipeline.');
    } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };

  if (!r) return <div className="center"><div className="spinner" /></div>;

  return (
    <>
      <div className="pagehead">
        <div>
          <span className="eyebrow">Report</span><h1>{r.file_name}</h1>
          <p className="sub">{fmtDate(r.created_at)} · {r.category} · via {r.extraction_method === 'ocr' ? 'OCR scan' : 'digital PDF'}</p>
          {(r.labels || []).length > 0 && (
            <div className="chips" style={{ marginTop: 10 }}>
              <span className="small" style={{ alignSelf: 'center', fontWeight: 700 }}>{t('detail.panels')}</span>
              {r.labels.map((l) => (
                <span key={l.category} className="chip" style={{ cursor: 'default' }} title={`Evidence score ${l.score} · from ${(l.metrics || []).join(', ') || 'report text'}`}>
                  {l.category} · {Math.round((l.confidence || 0) * 100)}%
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="row">
          <button className="btn ghost" onClick={reprocess} disabled={busy}>
            <Icon name="spark" size={16} />{busy ? 'Re-running…' : 'Re-run analysis'}
          </button>
          <Link className="btn ghost" to={`/app/chat?report_id=${r.id}`}><Icon name="chat" size={16} />Ask about this report</Link>
        </div>
      </div>

      {r.critical_flags?.length > 0 && (
        <div className="critical-box" role="alert" style={{ marginBottom: 14 }}>
          <h3><Icon name="alert" size={18} /> Critical values need a doctor's attention</h3>
          {r.critical_flags.map((f, i) => (
            <div className="kv" key={i}>
              <span className="k">{f.param}</span>
              <span><span className="num">{f.value}</span> <Pill critical /></span>
            </div>
          ))}
          <p className="small" style={{ margin: '10px 0 0' }}>
            These crossed urgent medical thresholds. Please consult a doctor promptly — this is not a diagnosis.
          </p>
        </div>
      )}

      <div className="grid cols-2">
        <div className="card">
          <h3>{t('detail.healthScore')}</h3>
          <ScoreRing score={r.health_score} band={r.health_band} />
          <p className="small mt">Share of values inside their reference range. Formula is fully disclosed — no black box.</p>
        </div>
        <div className="card">
          <h3>{t('detail.summary')}</h3>
          <p style={{ margin: '0 0 10px' }}>{r.summary}</p>
          <span className="small">Written by {r.summary_method === 'bart' ? 'AI summarizer' : 'extractive fallback'} · Educational only</span>
        </div>
      </div>

      {r.validation?.corrections?.length > 0 && (
        <div className="card mt" style={{ borderColor: 'var(--accent)', background: '#ECFDF5' }}>
          <h3 style={{ marginTop: 0 }}><Icon name="check" size={17} /> {t('detail.reviewedBy')} {r.validation.by_name}</h3>
          <p className="small" style={{ margin: 0 }}>
            This doctor corrected {r.validation.corrections.length} extracted value{r.validation.corrections.length > 1 ? 's' : ''}: {r.validation.corrections.map((c) => `${c.param} ${c.old_value} → ${c.new_value}`).join('; ')}. Statuses, score and summary above reflect the corrections.
            {' '}· {fmtDate(r.validation.at)}
          </p>
        </div>
      )}

      <div className="card mt">
        <h3>{t('detail.measured')} <span className="small">({r.metrics?.length || 0})</span></h3>
        <div className="tablewrap"><table className="data">
          <thead><tr><th>Parameter</th><th>Value</th><th>Status</th></tr></thead>
          <tbody>
            {(r.metrics || []).map((m, i) => (
              <tr key={i}>
                <td>{m.param}</td>
                <td className="num">{m.value} <span className="small">{m.unit}</span></td>
                <td><Pill status={m.status} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {r.referrals?.length > 0 && (
        <div className="card mt">
          <h3>{t('detail.suggested')}</h3>
          {r.referrals.map((ref, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <strong>{ref.specialization}</strong>
              {(ref.doctors || []).map((d) => (
                <div className="kv" key={d.name || d._id}>
                  <span className="k">{d.name} · {d.hospital || d.city}</span>
                  <span className="num small">₹{((d.fee_paise || 0) / 100).toFixed(0)}</span>
                </div>
              ))}
            </div>
          ))}
          <p className="small" style={{ margin: 0 }}>Demo directory — verify independently before booking.</p>
        </div>
      )}

      <div className="mt"><Disclaimer /></div>
    </>
  );
}
