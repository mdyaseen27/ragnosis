"""Stage 1 — text extraction. Digital PDFs via pdfplumber; images/scanned
content via OpenCV (grayscale -> adaptive threshold -> deskew) + Tesseract.

Returns (text, method) with method in {"pdfplumber", "ocr"}. Raises a clear
ValueError when no extraction path is available — never silently empty.
"""
import io
import re


def _pdfplumber_text(file_bytes):
    import pdfplumber  # lazy: only needed for PDFs

    chunks = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            chunks.append(page.extract_text() or "")
            for table in page.extract_tables() or []:
                for row in table:
                    chunks.append(" | ".join(c or "" for c in row))
    return "\n".join(chunks)


def _deskew(gray):
    import cv2  # lazy
    import numpy as np  # lazy

    coords = np.column_stack(np.where(gray < 128))
    if coords.size == 0:
        return gray
    angle = cv2.minAreaRect(coords)[-1]
    angle = -(90 + angle) if angle < -45 else -angle
    if abs(angle) < 0.5:
        return gray
    h, w = gray.shape[:2]
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(gray, matrix, (w, h),
                          flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def _ocr_image(file_bytes):
    try:
        import cv2  # lazy
        import numpy as np  # lazy
        import pytesseract  # lazy
    except ImportError:
        raise ValueError(
            "OCR requires opencv-python-headless and pytesseract "
            "(and the tesseract-ocr system package)."
        )
    img = cv2.imdecode(np.frombuffer(file_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image bytes.")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    def _read(image):
        # PSM 6 (uniform block) keeps table rows in reading order far
        # better than the auto mode on photographed reports.
        try:
            return pytesseract.image_to_string(image, config="--psm 6")
        except Exception as e:
            # TesseractNotFoundError = the tesseract system binary is
            # missing; surface it as a readable 422, not a 500 crash.
            if e.__class__.__name__ == "TesseractNotFoundError":
                raise ValueError(
                    "OCR requires the tesseract system package (brew install tesseract)."
                )
            raise ValueError(f"OCR failed: {e}")

    def _quality(text):
        # Word-like tokens — a cheap, deterministic readability score.
        return len(re.findall(r"[A-Za-z]{3,}", text or ""))

    # Clean images (screenshots, crisp scans) read best untouched; the
    # threshold + deskew pipeline can shred thin strokes on them. Read
    # plain first and only escalate when the plain read looks poor.
    plain = _read(gray)
    if _quality(plain) >= 12:
        return plain, "ocr"
    thr = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                cv2.THRESH_BINARY, 31, 10)
    enhanced = _read(_deskew(thr))
    best = enhanced if _quality(enhanced) > _quality(plain) else plain
    if not best.strip():
        raise ValueError("OCR produced no text; the image may be unreadable.")
    return best, "ocr"


def extract_text(file_bytes, mime):
    """Extract raw text. Returns (text, method)."""
    mime = (mime or "").lower()
    if mime == "application/pdf":
        try:
            text = _pdfplumber_text(file_bytes)
        except ImportError:
            raise ValueError("PDF extraction requires pdfplumber.")
        if text.strip():
            return text, "pdfplumber"
        raise ValueError(
            "PDF has no extractable text (likely a scan) and no OCR rasterizer "
            "is configured for PDFs in this build."
        )
    if mime in ("image/jpeg", "image/png", "image/jpg"):
        return _ocr_image(file_bytes)
    raise ValueError(f"Unsupported file type: {mime!r}. Use PDF, JPG, or PNG.")
