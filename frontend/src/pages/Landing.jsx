import { Link } from 'react-router-dom';
import { HOME, useAuth } from '../auth/AuthContext';
import PublicHeader from '../components/PublicHeader';
import { useLang } from '../i18n';
import { Disclaimer, Icon } from '../components/ui';

const FEATURES = [
  ['file', 'Report analysis', '28+ clinical parameters extracted from PDFs and photos, classified into 13 report categories, summarized in plain language with a transparent 0–100 health score.'],
  ['chat', 'Grounded chat', 'Ask follow-up questions about your own report. Answers are retrieved from a curated medical knowledge base — never invented — and always carry an educational disclaimer.'],
  ['users', 'Hospital module', 'One connected workflow for patients, doctors and receptionists: appointments, structured prescriptions and medicine reminders on the same pipeline.'],
];

const STEPS = [
  ['Create your account', 'Sign up as a patient in under a minute. Your data stays yours — export or delete it any time.'],
  ['Upload a report', 'A CBC, lipid panel, thyroid or diabetes report — PDF or a clear photo. Extraction is rule-based and auditable, never guessed.'],
  ['Understand & act', 'Every value explained in plain language, with what to ask your doctor. Book appointments and set medicine reminders in the same app.'],
];

export default function Landing() {
  const { user } = useAuth();
  const { t } = useLang();
  const home = user ? (HOME[user.role] || '/') : '/login';
  return (
    <div className="landing">
      <PublicHeader />

      <section className="hero">
        <div>
          <span className="eyebrow">{t('land.eyebrow')}</span>
          <h1>{t('land.titleA')} <span className="hl">{t('land.titleB')}</span></h1>
          <p className="lead">{t('land.sub')}</p>
          <div className="ctarow">
            <Link className="btn" to={home}>{user ? t('pub.openapp') : t('land.getStarted')}<Icon name="arrow" size={17} /></Link>
            <Link className="btn ghost" to="/how-it-works">{t('land.seeHow')}</Link>
          </div>
          <div className="trustbar" style={{ margin: '26px 0 0' }}>
            <span><Icon name="check" size={16} />{t('land.tick1')}</span>
            <span><Icon name="check" size={16} />{t('land.tick2')}</span>
            <span><Icon name="check" size={16} />{t('land.tick3')}</span>
          </div>
        </div>
        <div className="heroart" aria-hidden="true">
          <div className="card flat" style={{ position: 'relative' }}>
            <div className="spread" style={{ marginBottom: 12 }}>
              <strong>Lipid Profile</strong>
              <span className="pill normal"><span className="dot" />Normal</span>
            </div>
            <div className="kv"><span className="k">Total cholesterol</span><span className="num">182 mg/dL</span></div>
            <div className="kv"><span className="k">HDL</span><span className="num">54 mg/dL</span></div>
            <div className="kv"><span className="k">LDL</span><span className="num">104 mg/dL</span></div>
            <div className="kv"><span className="k">Triglycerides</span><span className="num">121 mg/dL</span></div>
            <p className="small" style={{ margin: '12px 0 0' }}>“Your cholesterol is within the desirable range. Keep up the balanced diet…”</p>
          </div>
        </div>
      </section>

      <div className="rule">{t('land.rule')}</div>

      <section aria-label="Features">
        <span className="eyebrow">What you get</span>
        <h2 style={{ fontSize: 'clamp(24px, 3vw, 32px)', marginBottom: 18 }}>{t('land.featuresTitle')}</h2>
        <div className="featgrid">
          {FEATURES.map(([icon, title, body]) => (
            <div className="card feat" key={title}>
              <div className="fic"><Icon name={icon} size={22} /></div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="How it works">
        <span className="eyebrow">Getting started</span>
        <h2 style={{ fontSize: 'clamp(24px, 3vw, 32px)', marginBottom: 18 }}>From report to clarity in three steps</h2>
        <div className="steps">
          {STEPS.map(([title, body]) => (
            <div className="step" key={title}>
              <div><h3>{title}</h3><p>{body}</p></div>
            </div>
          ))}
        </div>
        <div className="ctarow" style={{ marginBottom: 64 }}>
          <Link className="btn" to={home}>{user ? t('pub.openapp') : t('land.createFree')}<Icon name="arrow" size={17} /></Link>
        </div>
      </section>

      <Disclaimer>
        RAGnosis is an educational tool built as a final-year project. It is not a medical device
        and does not provide diagnoses. Always consult a qualified doctor for medical decisions.
      </Disclaimer>

      <footer className="footer" style={{ marginTop: 40 }}>
        <nav>
          <Link to="/how-it-works">{t('pub.how')}</Link>
          {user
            ? <Link to={home}>{t('pub.openapp')}</Link>
            : <Link to="/login">{t('pub.signin')}</Link>}
        </nav>
        RAGnosis · Educational use only — not a medical device.
      </footer>
    </div>
  );
}
