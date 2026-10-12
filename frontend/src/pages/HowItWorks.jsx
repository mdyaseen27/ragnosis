import { Link } from 'react-router-dom';
import { HOME, useAuth } from '../auth/AuthContext';
import PublicHeader from '../components/PublicHeader';
import TechGlyph from '../components/TechIcons';
import { Disclaimer, Icon } from '../components/ui';
import { useLang } from '../i18n';

const STEPS = [
  ['Text extraction', 'Digital PDFs are read directly; scans and photos go through OpenCV preprocessing plus Tesseract OCR.'],
  ['Metric extraction', 'A deterministic regex engine with name synonyms and unit normalization pulls 28+ clinical parameters — no neural network touches the numbers.'],
  ['Classification', 'Keyword scoring sorts the report into one of 13 categories (CBC, lipid, thyroid, diabetes and more) — no labeled training data needed.'],
  ['Entity tagging & summary', 'BioBERT tags conditions and drugs in free-text notes; BART writes the plain-language summary, with an extractive fallback if models are offline.'],
  ['Critical values & referrals', 'Fixed medical thresholds flag urgent values and suggest the right specialist from the doctor directory.'],
  ['Health score', 'A disclosed formula — metrics in range ÷ total metrics × 100 — so anyone can recompute it by hand.'],
  ['Grounded chat', 'Your question plus your report text is embedded, matched against a curated knowledge base, and answered by LLaMA-3 with citations.'],
  ['Graceful fallbacks', 'If any model is unavailable, the deterministic parts keep running and the generative parts degrade to curated tables instead of failing.'],
];

/* [glyph, text colour, tile tint, name, what it does here] */
const STACK = [
  {
    group: 'Frontend', icon: 'code',
    items: [
      ['react', '#087EA4', '#E2F4FB', 'React 18', 'Interface library'],
      ['vite', '#646CFF', '#ECEEFE', 'Vite', 'Build tool & dev server'],
      ['router', '#CA4245', '#FBEAEA', 'React Router', 'Client-side routing'],
    ],
  },
  {
    group: 'Backend & API', icon: 'server',
    items: [
      ['python', '#2B5B84', '#E8F0F7', 'Python 3', 'Backend language'],
      ['flask', '#1A1A1A', '#ECECEC', 'Flask 3', 'REST API framework'],
      ['gunicorn', '#2E7D32', '#E7F3E7', 'Gunicorn', 'Production WSGI server'],
      ['pyjwt', '#93328F', '#F7E9F7', 'PyJWT', 'Access & refresh tokens'],
      ['bcrypt', '#546E7A', '#EDF2F4', 'bcrypt', 'Password hashing, cost 12'],
    ],
  },
  {
    group: 'Database', icon: 'database',
    items: [
      ['mongodb', '#357A38', '#E9F5E9', 'MongoDB Atlas', 'Managed cloud database'],
      ['pymongo', '#3F7A37', '#EFF6EC', 'PyMongo', 'Database driver'],
    ],
  },
  {
    group: 'AI pipeline', icon: 'cpu',
    items: [
      ['pdfplumber', '#C2410C', '#FDF0E7', 'pdfplumber', 'PDF text extraction'],
      ['tesseract', '#37474F', '#EDF1F3', 'Tesseract OCR', 'Text from photos & scans'],
      ['opencv', '#4A2FD6', '#EEEAFE', 'OpenCV', 'Image preprocessing'],
      ['biobert', '#8A6D00', '#FBF3D3', 'BioBERT', 'Clinical entity tagging'],
      ['bart', '#B45309', '#FBF0DC', 'BART', 'Summary drafting'],
      ['minilm', '#7C3AED', '#F1EAFE', 'MiniLM', 'Text embeddings, 384-d'],
      ['faiss', '#0B5ED7', '#E5F1FE', 'FAISS', 'Vector similarity search'],
      ['groq', '#D63A1F', '#FDECE8', 'Groq · LLaMA 3.3 70B', 'Grounded chat answers'],
    ],
  },
];

export default function HowItWorks() {
  const { t } = useLang();
  const { user } = useAuth();
  const home = user ? (HOME[user.role] || '/') : '/login';
  return (
    <div className="landing">
      <PublicHeader />
      <span className="eyebrow">{t('how.eyebrow')}</span>
      <h1>{t('how.title')}</h1>
      <p className="sub">One shared pipeline: every report — patient upload, receptionist upload or mobile — runs through the identical stages.</p>
      <div className="steps">
        {STEPS.map(([t, d]) => (
          <div className="step" key={t}><div><h3>{t}</h3><p>{d}</p></div></div>
        ))}
      </div>

      <section aria-label="Tech stack" style={{ marginTop: 56 }}>
        <span className="eyebrow">Under the hood</span>
        <h2 style={{ fontSize: 'clamp(24px, 3vw, 32px)', marginBottom: 6 }}>{t('how.stackTitle')}</h2>
        <p className="sub" style={{ marginBottom: 26 }}>
          Pinned choices, one per layer. Models are loaded lazily — the deterministic
          core runs even when every neural component is offline.
        </p>
        <div className="stack-groups">
          {STACK.map(({ group, icon, items }) => (
            <div className="stack-group" key={group}>
              <h3><span className="fic"><Icon name={icon} size={19} /></span>{group}</h3>
              <div className="stack-grid">
                {items.map(([glyph, color, tint, name, role]) => (
                  <div className="tech" key={name}>
                    <span className="mono" style={{ color, background: tint }} aria-hidden="true"><TechGlyph id={glyph} /></span>
                    <span>
                      <span className="tn">{name}</span>
                      <span className="tr">{role}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt"><Disclaimer /></div>
      <footer className="footer" style={{ marginTop: 40 }}>
        <nav>
          <Link to="/">Home</Link>
          {user
            ? <Link to={home}>Open app</Link>
            : <Link to="/login">Sign in</Link>}
        </nav>
        RAGnosis · Educational use only — not a medical device. Built as a final-year project in Information Technology.
      </footer>
    </div>
  );
}
