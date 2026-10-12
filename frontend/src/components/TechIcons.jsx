/* Brand glyphs for the Tech Stack section — simplified, recognizable
   marks drawn as inline SVG (no external assets). Most inherit the
   chip's brand colour via currentColor; Python and OpenCV carry their
   signature multi-colour marks. */
const GLYPHS = {
  react: (<>
    <circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none" />
    <ellipse cx="12" cy="12" rx="10" ry="4.1" />
    <ellipse cx="12" cy="12" rx="10" ry="4.1" transform="rotate(60 12 12)" />
    <ellipse cx="12" cy="12" rx="10" ry="4.1" transform="rotate(120 12 12)" />
  </>),
  vite: (<path d="M13.2 2 4.9 13.4h5.9L9.7 22l8.2-11.4h-6L13.2 2z" fill="currentColor" stroke="none" />),
  router: (<>
    <circle cx="5" cy="19" r="2.4" />
    <circle cx="19" cy="5" r="2.4" />
    <path d="M7.4 19H15a4 4 0 0 0 4-4v-7.6" />
  </>),
  python: (<>
    <path d="M12 2.8a5.2 5.2 0 0 1 5.2 5.2v3.2H6.8V8A5.2 5.2 0 0 1 12 2.8z" fill="#3776AB" stroke="none" />
    <path d="M6.8 12.8h10.4V16a5.2 5.2 0 0 1-10.4 0v-3.2z" fill="#E8B90F" stroke="none" />
    <circle cx="9.7" cy="7.4" r="1.15" fill="#fff" stroke="none" />
    <circle cx="14.3" cy="16.6" r="1.15" fill="#fff" stroke="none" />
  </>),
  flask: (<>
    <path d="M10 2.5h4" />
    <path d="M10 2.5v5.2L4.9 18a2.4 2.4 0 0 0 2.1 3.5h10a2.4 2.4 0 0 0 2.1-3.5L14 7.7V2.5" />
    <path d="M7.6 15h8.8" />
  </>),
  gunicorn: (<>
    <circle cx="12" cy="12" r="3.4" />
    <path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1" />
  </>),
  pyjwt: (<>
    <circle cx="8" cy="15.5" r="4.5" />
    <path d="M11.2 12.3 20.5 3M16.5 7l3 3M13.8 9.7l2.4 2.4" />
  </>),
  bcrypt: (<>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    <circle cx="12" cy="15.5" r="1.5" fill="currentColor" stroke="none" />
  </>),
  mongodb: (<>
    <path d="M12 2.8c2.9 4 5.2 7.7 5.2 11.1a5.2 5.2 0 0 1-10.4 0C6.8 10.5 9.1 6.8 12 2.8z" fill="currentColor" stroke="none" />
    <path d="M12 21.2v-6.5" stroke="#fff" strokeWidth="1.5" />
  </>),
  pymongo: (<>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14a9 3 0 0 0 18 0V5" />
    <path d="M3 12a9 3 0 0 0 18 0" />
  </>),
  pdfplumber: (<>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M9 13h6M9 17h6" />
  </>),
  tesseract: (<path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16M3.5 12h17" />),
  opencv: (<>
    <circle cx="9" cy="9" r="5" stroke="#2563EB" />
    <circle cx="15" cy="9" r="5" stroke="#DC2626" />
    <circle cx="12" cy="14.5" r="5" stroke="#16A34A" />
  </>),
  biobert: (<path d="M3 12h4l2.5 7L14 5l2.5 7H21" />),
  bart: (<path d="M4 6h16M4 12h10M4 18h13" />),
  minilm: (<>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="18" cy="8" r="2.5" />
    <circle cx="9" cy="18" r="2.5" />
    <path d="M8.3 6.7l7.3.6M6.9 8.4l1.2 7.2M17 10.4l-5.6 5.4" />
  </>),
  faiss: (<>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3.6 12.6L12 17l8.4-4.4" />
    <path d="M3.6 16.6L12 21l8.4-4.4" />
  </>),
  groq: (<>
    <path d="M21 8.2A8.5 8.5 0 1 0 21 15" />
    <path d="M12.5 12H21" />
    <path d="M21 12v3.2" />
  </>),
};

export default function TechGlyph({ id, size = 23 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {GLYPHS[id] || null}
    </svg>
  );
}
