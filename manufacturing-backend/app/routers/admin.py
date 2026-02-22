"""
Admin-only routes:
  POST   /admin/documents                       – upload SOP PDF
  GET    /admin/documents                       – list all documents
  POST   /admin/documents/{id}/generate-training – enqueue training job
  GET    /admin/trainings/{id}                  – view training detail
  POST   /admin/trainings/{id}/assign           – assign to employees
  GET    /admin/users                           – list employees (for assignment UI)
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from rq import Queue
from redis import Redis
from sqlalchemy.orm import Session

from ..auth.dependencies import require_admin
from ..config import get_settings
from ..database import get_db
from ..models import Document, Training, Assignment, User
from ..schemas import (
    AssignRequest,
    AssignmentOut,
    DocumentListItem,
    DocumentOut,
    EmployeeListItem,
    GenerateTrainingResponse,
    TrainingOut,
)
# from ..services.s3 import upload_file_to_s3  # TODO: re-enable when S3 is configured
from ..workers.training_worker import generate_training

router = APIRouter(prefix="/admin", tags=["admin"])
settings = get_settings()


def _get_rq_queue() -> Queue:
    redis_conn = Redis.from_url(settings.REDIS_URL)
    return Queue(connection=redis_conn)


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

@router.post("/documents", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    file_bytes = await file.read()

    # TODO: replace file_data with S3 upload when AWS is configured:
    #   key = f"sops/{uuid.uuid4()}/{file.filename}"
    #   s3_url = upload_file_to_s3(file_bytes, key, content_type="application/pdf")
    doc = Document(
        title=file.filename,
        s3_url=None,          # not used while S3 is disabled
        file_data=file_bytes, # PDF stored directly in Postgres
        uploaded_by=current_user.id,
        status="uploaded",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/documents", response_model=list[DocumentListItem])
def list_documents(
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    docs = db.query(Document).order_by(Document.created_at.desc()).all()
    return [
        DocumentListItem(
            id=doc.id,
            title=doc.title,
            status=doc.status,
            created_at=doc.created_at,
            training_id=doc.training.id if doc.training else None,
            error_message=doc.error_message,
        )
        for doc in docs
    ]


@router.get("/documents/{document_id}", response_model=DocumentListItem)
def get_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentListItem(
        id=doc.id,
        title=doc.title,
        status=doc.status,
        created_at=doc.created_at,
        training_id=doc.training.id if doc.training else None,
        error_message=doc.error_message,
    )


@router.post("/documents/{document_id}/generate-training", response_model=GenerateTrainingResponse)
def enqueue_generate_training(
    document_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.status == "processing":
        raise HTTPException(status_code=409, detail="Training generation already in progress")

    doc.status = "processing"
    doc.error_message = None
    doc.progress_message = "Queued…"
    doc.updated_at = datetime.utcnow()
    db.commit()

    queue = _get_rq_queue()
    job = queue.enqueue(generate_training, document_id)

    # Store the RQ job id so we can cancel it later
    doc.job_id = job.id
    db.commit()

    return GenerateTrainingResponse(document_id=document_id, status="processing")


@router.post("/documents/{document_id}/cancel-training")
def cancel_training(
    document_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.status != "processing":
        raise HTTPException(status_code=409, detail="Document is not being processed")

    # Cancel the RQ job if it hasn't started yet
    if doc.job_id:
        try:
            from rq.job import Job
            redis_conn = Redis.from_url(settings.REDIS_URL)
            job = Job.fetch(doc.job_id, connection=redis_conn)
            job.cancel()
        except Exception:
            pass  # job may have already started or finished

    doc.status = "uploaded"
    doc.job_id = None
    doc.progress_message = None
    doc.updated_at = datetime.utcnow()
    db.commit()

    return {"document_id": document_id, "status": "uploaded"}


# ---------------------------------------------------------------------------
# Trainings
# ---------------------------------------------------------------------------

@router.get("/trainings/{training_id}", response_model=TrainingOut)
def get_training(
    training_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    training = db.query(Training).filter(Training.id == training_id).first()
    if not training:
        raise HTTPException(status_code=404, detail="Training not found")
    return TrainingOut(
        id=training.id,
        doc_id=training.doc_id,
        title=training.title,
        modules=training.modules,
        created_at=training.created_at,
        assigned_user_ids=[a.user_id for a in training.assignments],
    )


# ---------------------------------------------------------------------------
# Assignments
# ---------------------------------------------------------------------------

@router.post("/trainings/{training_id}/assign", response_model=list[AssignmentOut])
def assign_training(
    training_id: int,
    payload: AssignRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    training = db.query(Training).filter(Training.id == training_id).first()
    if not training:
        raise HTTPException(status_code=404, detail="Training not found")

    created = []
    for uid in payload.user_ids:
        # Idempotent: skip if already assigned
        exists = (
            db.query(Assignment)
            .filter(Assignment.training_id == training_id, Assignment.user_id == uid)
            .first()
        )
        if exists:
            continue
        assignment = Assignment(training_id=training_id, user_id=uid)
        db.add(assignment)
        db.flush()
        created.append(assignment)

    db.commit()
    for a in created:
        db.refresh(a)
    return created


# ---------------------------------------------------------------------------
# Admin user list (employees only, for assignment UI)
# ---------------------------------------------------------------------------

@router.get("/users", response_model=list[EmployeeListItem])
def list_employees(
    db: Session = Depends(get_db),
    current_user=Depends(require_admin),
):
    return db.query(User).filter(User.role == "employee").all()
