from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, EmailStr


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: str  # "admin" or "employee"


class UserOut(BaseModel):
    id: int
    email: str
    role: str

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

class DocumentOut(BaseModel):
    id: int
    title: str
    s3_url: Optional[str]  # null while S3 is disabled
    status: str
    uploaded_by: int
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentListItem(BaseModel):
    id: int
    title: str
    status: str
    created_at: datetime
    training_id: Optional[int] = None
    error_message: Optional[str] = None
    progress_message: Optional[str] = None

    model_config = {"from_attributes": True}


class GenerateTrainingResponse(BaseModel):
    document_id: int
    status: str


# ---------------------------------------------------------------------------
# Trainings
# ---------------------------------------------------------------------------

class TrainingOut(BaseModel):
    id: int
    doc_id: int
    title: str
    modules: Any  # raw JSON
    created_at: datetime
    assigned_user_ids: list[int] = []

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Assignments
# ---------------------------------------------------------------------------

class AssignRequest(BaseModel):
    user_ids: list[int]


class AssignmentOut(BaseModel):
    id: int
    training_id: int
    user_id: int
    assigned_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Employee trainings
# ---------------------------------------------------------------------------

class EmployeeTrainingItem(BaseModel):
    training_id: int
    title: str
    assigned_at: datetime
    completed: bool
    score: Optional[int]


class ProgressInfo(BaseModel):
    completed: bool
    score: Optional[int]


class EmployeeTrainingDetail(BaseModel):
    id: int
    title: str
    modules: Any
    progress: ProgressInfo


# ---------------------------------------------------------------------------
# Quiz
# ---------------------------------------------------------------------------

class QuizAnswer(BaseModel):
    question_id: str
    selected_index: int


class QuizSubmission(BaseModel):
    answers: list[QuizAnswer]


class QuizResult(BaseModel):
    score: int
    passed: bool


# ---------------------------------------------------------------------------
# Admin users list (for assignment UI)
# ---------------------------------------------------------------------------

class EmployeeListItem(BaseModel):
    id: int
    email: str

    model_config = {"from_attributes": True}
