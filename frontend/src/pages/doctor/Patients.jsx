import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Empty, Field, Icon, toast } from '../../components/ui';
import { useLang } from '../../i18n';

export default function Patients() {
  const { t } = useLang();
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);

  const search = async (term) => {
    try {
      const d = await api(`/hospital/patients${term ? `?q=${encodeURIComponent(term)}` : ''}`);
      setList(d.patients);
    } catch (e) { toast(e.message, 'err'); setList([]); }
  };
  useEffect(() => { search(''); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="pagehead"><div>
        <span className="eyebrow">Patient roster</span>
        <h1>{t('patients.title')}</h1>
        <p className="sub">Only patients with appointments under your care are visible — enforced server-side.</p>
      </div></div>
      <div className="card">
        <Field label={<><Icon name="search" size={14} />{' '}Search by name</>}>
          <input className="input" value={q} placeholder="Start typing a name…"
            onChange={(e) => { setQ(e.target.value); search(e.target.value); }} />
        </Field>
        {list === null ? <div className="center"><div className="spinner" /></div>
          : list.length === 0 ? <Empty icon="users" title="No patients found" body="Try a different spelling, or check today's schedule." />
          : (
            <div className="tablewrap"><table className="data">
              <thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th></th></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p._id || p.id}>
                    <td><strong>{p.name}</strong></td><td className="small">{p.email}</td>
                    <td className="num small">{p.mobile || '—'}</td>
                    <td><Link className="btn ghost small" to={`/doctor/patients/${p._id || p.id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
      </div>
    </>
  );
}
