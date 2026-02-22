"""
RQ worker job: generate training modules and quiz from a SOP PDF.

Enqueued by POST /admin/documents/{id}/generate-training.
"""
import io
import json
import logging
import random
import textwrap
from datetime import datetime

from google import genai
from google.genai import types as genai_types
import PyPDF2

from ..config import get_settings
from ..database import SessionLocal
from ..models import Document, Training

logger = logging.getLogger(__name__)
settings = get_settings()


# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------

PROMPT_TEMPLATE = textwrap.dedent("""
You are a manufacturing training expert and instructional designer.

Your task is to read the following Standard Operating Procedure (SOP) text and
produce a structured training program with a multiple-choice quiz.

--- SOP TEXT START ---
{sop_text}
--- SOP TEXT END ---

Produce valid JSON that matches EXACTLY this schema (no markdown, no comments,
no extra keys, JSON only):

{{
  "title": "<concise training title derived from the SOP>",
  "modules": [
    {{
      "id": "module-1",
      "title": "<module title>",
      "summary": "<one-sentence summary>",
      "content": [
        {{
          "type": "paragraph",
          "text": "<paragraph text>"
        }},
        {{
          "type": "bullet_list",
          "items": ["<item 1>", "<item 2>"]
        }}
      ],
      "quiz": {{
        "questions": [
          {{
            "id": "q1",
            "question": "<question text>",
            "options": ["<option A>", "<option B>", "<option C>"],
            "correct_index": 0,
            "explanation": "<why this answer is correct>"
          }}
        ]
      }}
    }}
  ]
}}

Rules:
- Create 2-4 modules covering different sections of the SOP.
- Each module must have at least 2 quiz questions with exactly 3 answer options.
- Use stable, sequential IDs: module-1, module-2, … and q1, q2, q3, … (global across all modules).
- correct_index is 0-based (0 = first option).
- content must have a mix of "paragraph" and "bullet_list" blocks.
- Respond with valid JSON only — no markdown fences, no comments.
""")


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------

def _extract_text_from_pdf(pdf_bytes: bytes) -> str:
    reader = PyPDF2.PdfReader(io.BytesIO(pdf_bytes))
    parts = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            parts.append(text.strip())
    return "\n\n".join(parts)


def _chunk_text(text: str, max_chars: int = 12_000) -> str:
    """Return at most max_chars of text (Gemini handles long context well, but keep it reasonable)."""
    return text[:max_chars]


# ---------------------------------------------------------------------------
# Gemini call
# ---------------------------------------------------------------------------

def _call_gemini(prompt: str) -> dict:
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            temperature=0.2,
            response_mime_type="application/json",
        ),
    )
    raw = response.text.strip()
    # Strip markdown fences if the model ignored the instruction
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw)


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def _validate_training_json(data: dict) -> None:
    """Raise ValueError if the structure is missing required keys."""
    if "title" not in data:
        raise ValueError("Missing 'title' in generated JSON")
    if "modules" not in data or not isinstance(data["modules"], list):
        raise ValueError("Missing or invalid 'modules' list")
    for mod in data["modules"]:
        for key in ("id", "title", "content", "quiz"):
            if key not in mod:
                raise ValueError(f"Module missing key: {key}")
        for q in mod["quiz"].get("questions", []):
            for key in ("id", "question", "options", "correct_index"):
                if key not in q:
                    raise ValueError(f"Question missing key: {key}")


# ---------------------------------------------------------------------------
# Option shuffler
# ---------------------------------------------------------------------------

def _shuffle_options(data: dict) -> dict:
    """Shuffle each question's options in-place and update correct_index."""
    for mod in data.get("modules", []):
        for q in mod.get("quiz", {}).get("questions", []):
            options = q["options"]
            correct_answer = options[q["correct_index"]]
            random.shuffle(options)
            q["correct_index"] = options.index(correct_answer)
    return data


# ---------------------------------------------------------------------------
# Main worker function
# ---------------------------------------------------------------------------

def generate_training(document_id: int) -> None:
    """
    RQ job entry point.
    1. Load document from DB.
    2. Download PDF from S3.
    3. Extract text and build prompt.
    4. Call Gemini.
    5. Validate and store training JSON.
    6. Update document status.
    """
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            logger.error("Document %d not found", document_id)
            return

        def _set_progress(message: str) -> None:
            """Persist a progress message so the UI can display it."""
            doc.progress_message = message
            doc.updated_at = datetime.utcnow()
            db.commit()
            logger.info("[doc %d] %s", document_id, message)

        # Mark as processing (already done by the API, but set again for safety)
        doc.status = "processing"
        _set_progress("Starting…")

        # TODO: when S3 is enabled, replace the block below with:
        #   from ..services.s3 import download_file_from_s3
        #   s3_key = doc.s3_url.split(f"...amazonaws.com/")[-1]
        #   pdf_bytes = download_file_from_s3(s3_key)
        _set_progress("Reading PDF…")
        if not doc.file_data:
            raise ValueError("Document has no file data stored")
        pdf_bytes = doc.file_data

        # Extract and chunk text
        _set_progress("Extracting text from PDF…")
        raw_text = _extract_text_from_pdf(pdf_bytes)
        sop_text = _chunk_text(raw_text)

        if not sop_text.strip():
            raise ValueError("Could not extract any text from the PDF")

        # Build prompt and call Gemini
        _set_progress("Sending to Gemini AI — this may take 30–60 seconds…")
        prompt = PROMPT_TEMPLATE.format(sop_text=sop_text)
        training_data = _call_gemini(prompt)

        # Validate structure
        _set_progress("Validating AI response…")
        _validate_training_json(training_data)

        # Shuffle answer options so the correct answer isn't always first
        _shuffle_options(training_data)

        # Persist training
        _set_progress("Saving training…")
        training = Training(
            doc_id=document_id,
            title=training_data["title"],
            modules=training_data,  # store the whole object; modules key inside
        )
        db.add(training)

        doc.status = "training_ready"
        doc.progress_message = None
        doc.job_id = None
        doc.updated_at = datetime.utcnow()
        db.commit()
        logger.info("Training generated for document %d (training id %d)", document_id, training.id)

    except Exception as exc:
        logger.exception("Failed to generate training for document %d: %s", document_id, exc)
        try:
            doc = db.query(Document).filter(Document.id == document_id).first()
            if doc:
                doc.status = "failed"
                doc.error_message = str(exc)[:500]
                doc.progress_message = None
                doc.job_id = None
                doc.updated_at = datetime.utcnow()
                db.commit()
        except Exception:
            pass
    finally:
        db.close()
