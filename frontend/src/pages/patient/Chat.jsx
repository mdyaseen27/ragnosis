import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Disclaimer, Icon, toast } from '../../components/ui';
import { useLang } from '../../i18n';

export default function Chat() {
  const { t } = useLang();
  const [params] = useSearchParams();
  const reportId = params.get('report_id');
  const [sessions, setSessions] = useState([]);
  const [sid, setSid] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef();

  const loadSessions = useCallback(async () => {
    try {
      const d = await api(`/chat/sessions${reportId ? `?report_id=${reportId}` : ''}`);
      setSessions(d.sessions);
    } catch (e) { toast(e.message, 'err'); }
  }, [reportId]);
  useEffect(() => { loadSessions(); }, [loadSessions]);

  const open = async (id) => {
    setSid(id);
    try {
      const d = await api(`/chat/sessions/${id}`);
      setMsgs(d.messages);
    } catch (e) { toast(e.message, 'err'); }
  };

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);

  const ask = async (e, preset) => {
    if (e) e.preventDefault();
    const question = (preset || q).trim();
    if (!question || busy) return;
    setQ(''); setBusy(true);
    setMsgs((m) => [...m, { role: 'user', content: question }]);
    try {
      const d = await api('/chat/ask', { method: 'POST', body: { question, session_id: sid, report_id: reportId || undefined } });
      setSid(d.session_id);
      setMsgs((m) => [...m, { role: 'assistant', content: d.answer, citations: d.citations, model: d.model }]);
      loadSessions();
    } catch (ex) { toast(ex.message, 'err'); }
    setBusy(false);
  };

  const remove = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this chat?')) return;
    try { await api(`/chat/sessions/${id}`, { method: 'DELETE' }); }
    catch (ex) { toast(ex.message, 'err'); return; }
    if (sid === id) { setSid(null); setMsgs([]); }
    loadSessions();
  };

  return (
    <>
      <div className="pagehead"><div>
        <span className="eyebrow">AI assistant</span>
        <h1>{reportId ? t('detail.askAbout') : t('chat.title')}</h1>
        <p className="sub">{reportId
          ? 'This chat has your report\'s full data — every extracted value, its reference range and your health score. Ask about any of them.'
          : 'Answers are grounded in your reports and a curated medical knowledge base — with sources shown.'}</p>
      </div></div>
      <div className="chatwrap">
        <div className="card sessions">
          <button className="btn ghost small" style={{ width: '100%', marginBottom: 8 }}
            onClick={() => { setSid(null); setMsgs([]); }}><Icon name="plus" size={16} /> New chat</button>
          {sessions.map((s) => (
            <button key={s.id} className={`sess${s.id === sid ? ' active' : ''}`} onClick={() => open(s.id)}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
              <span className="x" onClick={(e) => remove(s.id, e)} aria-label="Delete conversation"><Icon name="x" size={15} /></span>
            </button>
          ))}
          {sessions.length === 0 && <p className="small">No chats yet. Ask your first question below.</p>}
        </div>
        <div className="card chat">
          <div className="msgs">
            {msgs.length === 0 && !busy && (
              <div className="empty">
                <Icon name="chat" size={40} />
                <h3>How can I help?</h3>
                <p>{reportId
                  ? 'Ask anything about this report — a specific value, what\'s out of range, or the summary.'
                  : 'Try: “What does high LDL mean for me?” or “Which of my values are out of range?”'}</p></div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.content}
                {m.citations?.length > 0 && (
                  <span className="cite">Sources: {m.citations.map((c) => c.topic || c.chunk_id).join(', ')}</span>
                )}
              </div>
            ))}
            {busy && <div className="msg assistant"><div className="spinner" style={{ width: 22, height: 22 }} /></div>}
            <div ref={bottom} />
          </div>
          {reportId && (
            <div className="chips">
              {[['chat.chip1', 'Which of my values are out of range?'], ['chat.chip2', 'Explain my report'],
                ['chat.chip3', 'What is my health score?'], ['chat.chip4', 'Show all my values']].map(([key, question]) => (
                <button type="button" key={key} className="chip" disabled={busy}
                  onClick={() => ask(null, question)}>{t(key)}</button>
              ))}
            </div>
          )}
          <form className="askrow" onSubmit={ask}>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={t('chat.placeholder')} aria-label="Your question" maxLength={500} />
            <button className="btn" disabled={busy || !q.trim()}><Icon name="arrow" size={16} /> {t('chat.ask')}</button>
          </form>
          <div style={{ marginTop: 10 }}><Disclaimer>{t('chat.disclaimer')}</Disclaimer></div>
        </div>
      </div>
    </>
  );
}
