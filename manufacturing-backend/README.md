# Manufacturing SOP Training Platform — Backend

FastAPI backend for the AI-powered SOP training platform. Handles auth, document storage, AI training generation via Gemini, and employee quiz scoring.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | Python 3.13 |
| Framework | FastAPI |
| Database | Neon Postgres (via SQLAlchemy 2.x) |
| Migrations | Alembic |
| Auth | JWT (python-jose) + bcrypt |
| Storage | AWS S3 (disabled in dev — PDF stored in DB) |
| Background jobs | RQ + Redis |
| AI | Google Gemini 2.5 Flash (`google-genai`) |
| PDF parsing | PyPDF2 |

---

## Project Structure

```
manufacturing-backend/
├── app/
│   ├── main.py              # FastAPI app, CORS, router registration
│   ├── config.py            # Pydantic-settings (reads .env)
│   ├── database.py          # SQLAlchemy engine + session
│   ├── models.py            # ORM models (users, documents, trainings, assignments, progress)
│   ├── schemas.py           # Pydantic request/response schemas
│   ├── auth/
│   │   ├── helpers.py       # hash_password, verify_password, create_access_token
│   │   ├── dependencies.py  # get_current_user, require_admin, require_employee
│   │   └── router.py        # POST /auth/register, POST /auth/login, GET /auth/me
│   ├── routers/
│   │   ├── admin.py         # All /admin/* endpoints
│   │   └── employee.py      # All /employee/* endpoints + quiz scoring
│   ├── services/
│   │   └── s3.py            # upload_file_to_s3, download_file_from_s3 (disabled in dev)
│   └── workers/
│       └── training_worker.py  # RQ job: PDF → Gemini → training JSON → DB
├── alembic/
│   ├── env.py               # Alembic config (reads DATABASE_URL from .env)
│   └── versions/            # Migration files
│       └── c914c2d13626_initial_schema.py
├── alembic.ini
├── worker.py                # RQ worker startup script
├── requirements.txt
└── .env.example
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values:

```env
# Database (Neon Postgres)
DATABASE_URL=postgresql+psycopg2://user:password@host/dbname

# JWT
SECRET_KEY=change-this-to-a-secure-random-string
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# AWS S3 (leave blank during dev — PDF is stored in DB instead)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
S3_BUCKET_NAME=manufacturing-sop-pdfs

# Redis (for RQ background jobs)
REDIS_URL=redis://localhost:6379

# Google Gemini
GEMINI_API_KEY=your-gemini-api-key
```

---

## Setup & Running

### 1. Install dependencies

```bash
# Using uv (recommended)
uv sync

# Or using pip
pip install -r requirements.txt
```

### 2. Start Redis

```bash
# Install via Homebrew (macOS) if not already installed
brew install redis && brew services start redis

# Verify
redis-cli ping   # → PONG
```

### 3. Run database migrations

```bash
# Apply all migrations to the database
uv run alembic upgrade head
```

### 4. Start the API server

```bash
uv run uvicorn app.main:app --reload
```

API is available at `http://localhost:8000`.
Interactive docs: `http://localhost:8000/docs`

### 5. Start the RQ worker (separate terminal)

```bash
uv run python worker.py
```

The worker picks up background jobs (training generation) from Redis.

---

## API Endpoints

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | None | Create admin or employee user |
| POST | `/auth/login` | None | Login, returns JWT |
| GET | `/auth/me` | Bearer | Current user info |

### Admin
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/admin/documents` | Admin | Upload SOP PDF |
| GET | `/admin/documents` | Admin | List all documents |
| POST | `/admin/documents/{id}/generate-training` | Admin | Enqueue AI training generation |
| GET | `/admin/trainings/{id}` | Admin | View training with modules + quiz |
| POST | `/admin/trainings/{id}/assign` | Admin | Assign training to employees |
| GET | `/admin/users` | Admin | List all employees |

### Employee
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/employee/trainings` | Employee | List assigned trainings |
| GET | `/employee/trainings/{id}` | Employee | Training detail + progress |
| POST | `/employee/trainings/{id}/submit-quiz` | Employee | Submit quiz answers, get score |

---

## Database Migrations (Alembic)

```bash
# Apply all pending migrations
uv run alembic upgrade head

# Check current revision
uv run alembic current

# View migration history
uv run alembic history

# Create a new migration after changing models.py
uv run alembic revision --autogenerate -m "describe_your_change"

# Roll back one step
uv run alembic downgrade -1
```

> **Note:** Never edit `create_all` in `main.py` for schema changes. Always use Alembic migrations so changes are tracked and reproducible.

---

## Training Generation Flow

1. Admin uploads a PDF → stored in Postgres (`documents.file_data`).
2. Admin clicks "Generate Training" → `POST /admin/documents/{id}/generate-training`.
3. FastAPI sets `document.status = "processing"` and enqueues an RQ job.
4. The RQ worker (`training_worker.py`) picks up the job:
   - Reads PDF bytes from DB.
   - Extracts text with PyPDF2.
   - Sends text to Gemini 2.5 Flash with a structured prompt.
   - Validates and stores the returned JSON in the `trainings` table.
   - Sets `document.status = "training_ready"`.
5. Frontend polls `GET /admin/documents` (every 5s) and shows "View Training" when ready.

---

## Quiz Scoring

- Score = `(correct answers / total questions) × 100` (integer).
- Pass threshold: **≥ 80%**.
- Results stored in the `progress` table (upsert — retaking the quiz overwrites the previous score).

---

## S3 Storage (disabled in dev)

PDF bytes are currently stored directly in Postgres (`documents.file_data`). To enable S3:

1. Fill in the AWS env vars in `.env`.
2. In `app/routers/admin.py`, uncomment the S3 upload block and remove `file_data=file_bytes`.
3. In `app/workers/training_worker.py`, uncomment the S3 download block and remove the `doc.file_data` read.
