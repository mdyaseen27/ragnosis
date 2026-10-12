import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { useLang } from '../../i18n';
import { BandPill, Empty, Field, fmtDay, Icon, Modal, Pill } from '../../components/ui';

export default function Reports() {
  const { t } = useLang();
  const [reports, setReports] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [noteErr, setNoteErr] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const inputRef = useRef();

  const load = async () => {
    try { const d = await api('/reports?limit=50'); setReports(d.reports); setLoadErr(''); }
    catch (e) { setLoadErr(e.message || 'Could not load your reports.'); }
  };
  useEffect(() => { load(); }, []);

  const upload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setNote(''); setNoteErr(false);
    try {
      const form = new FormData();
      form.append('file', file);
      const d = await api('/reports/upload', { method: 'POST', form });
      setNote(d.report.deduped
        ? 'This exact file was already analyzed — showing the existing report.'
        : `Analyzed in ${(d.report.processing_ms / 1000).toFixed(1)}s.`);
      setShowUpload(false); setFile(null);
      await load();
    } catch (ex) {
      setNoteErr(true);
      setNote(ex instanceof ApiError ? ex.message : 'Upload failed.');
    }
    setBusy(false);
  };

  return (
    <>
      <div className="pagehead">
        <div><span className="eyebrow">Your records</span><h1>{t('reports.title')}</h1><p className="sub">{t('reports.sub')}</p></div>
        <button className="btn" onClick={() => setShowUpload(true)}><Icon name="upload" size={16} />{t('reports.upload')}</button>
      </div>
      {reports === null && loadErr ? (
          <Empty icon="alert" title="Couldn't load your reports" body={loadErr}
            action={<button className="btn" onClick={load}>Retry</button>} />
        ) : reports === null ? <div className="center"><div className="spinner" /></div>
        : reports.length === 0 ? (
          <Empty title="No reports yet"
            body="Upload a lab report (PDF or photo) to see extracted values, a plain-language summary and your health score."
            action={<button className="btn" onClick={() => setShowUpload(true)}><Icon name="upload" size={16} />Upload your first report</button>} />
        ) : (
          <div className="grid">
            {reports.map((r) => (
              <Link key={r.id} to={`/app/reports/${r.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="spread">
                  <div><h3 style={{ marginBottom: 4 }}>{r.file_name}</h3>
                    <span className="small">{fmtDay(r.created_at)} · {r.category}</span></div>
                  <div className="row">
                    {r.critical_count > 0 && <Pill critical />}
                    <span className="num" style={{ fontSize: 26 }}>{Math.round(r.health_score)}</span>
                    <BandPill band={r.health_band} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      {showUpload && (
        <Modal title="Upload lab report" onClose={() => setShowUpload(false)}>
          <form onSubmit={upload}>
            <Field label="Report file" hint="PDF, JPG or PNG, up to 15 MB. Scanned reports are read with OCR.">
              <input ref={inputRef} className="input" type="file" accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setFile(e.target.files[0])} required />
            </Field>
            {note && <div className="form-err" style={noteErr ? undefined : { borderColor: 'var(--primary)', background: 'var(--primary-soft)', color: 'var(--primary-deep)' }}>{note}</div>}
            <button className="btn" style={{ width: '100%' }} disabled={busy || !file}>
              {busy ? 'Analyzing…' : <><Icon name="upload" size={16} />Upload and analyze</>}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
