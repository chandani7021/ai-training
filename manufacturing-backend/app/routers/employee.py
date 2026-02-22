"""
Employee-only routes:
  GET  /employee/trainings          – list assigned trainings
  GET  /employee/trainings/{id}     – training detail + progress
  POST /employee/trainings/{id}/submit-quiz – submit quiz answers
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth.dependencies import require_employee
from ..database import get_db
from ..models import Assignment, Progress, Training
from ..schemas import (
    EmployeeTrainingDetail,
    EmployeeTrainingItem,
    ProgressInfo,
    QuizResult,
    QuizSubmission,
)

router = APIRouter(prefix="/employee", tags=["employee"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_assignment_or_404(training_id: int, user_id: int, db: Session) -> Assignment:
    assignment = (
        db.query(Assignment)
        .filter(Assignment.training_id == training_id, Assignment.user_id == user_id)
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Training not assigned to you")
    return assignment


def _get_progress(training_id: int, user_id: int, db: Session) -> Progress | None:
    return (
        db.query(Progress)
        .filter(Progress.training_id == training_id, Progress.user_id == user_id)
        .first()
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/trainings", response_model=list[EmployeeTrainingItem])
def list_assigned_trainings(
    db: Session = Depends(get_db),
    current_user=Depends(require_employee),
):
    assignments = (
        db.query(Assignment)
        .filter(Assignment.user_id == current_user.id)
        .all()
    )

    result = []
    for a in assignments:
        training = a.training
        prog = _get_progress(training.id, current_user.id, db)
        result.append(
            EmployeeTrainingItem(
                training_id=training.id,
                title=training.title,
                assigned_at=a.assigned_at,
                completed=prog.completed if prog else False,
                score=prog.score if prog else None,
            )
        )
    return result


@router.get("/trainings/{training_id}", response_model=EmployeeTrainingDetail)
def get_training_detail(
    training_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_employee),
):
    _get_assignment_or_404(training_id, current_user.id, db)

    training = db.query(Training).filter(Training.id == training_id).first()
    if not training:
        raise HTTPException(status_code=404, detail="Training not found")

    prog = _get_progress(training_id, current_user.id, db)

    return EmployeeTrainingDetail(
        id=training.id,
        title=training.title,
        modules=training.modules,
        progress=ProgressInfo(
            completed=prog.completed if prog else False,
            score=prog.score if prog else None,
        ),
    )


@router.post("/trainings/{training_id}/submit-quiz", response_model=QuizResult)
def submit_quiz(
    training_id: int,
    payload: QuizSubmission,
    db: Session = Depends(get_db),
    current_user=Depends(require_employee),
):
    _get_assignment_or_404(training_id, current_user.id, db)

    training = db.query(Training).filter(Training.id == training_id).first()
    if not training:
        raise HTTPException(status_code=404, detail="Training not found")

    # Build lookup: question_id → correct_index
    modules_data = training.modules  # dict with "modules" key
    correct_map: dict[str, int] = {}
    for mod in modules_data.get("modules", []):
        for q in mod.get("quiz", {}).get("questions", []):
            correct_map[q["id"]] = q["correct_index"]

    if not correct_map:
        raise HTTPException(status_code=422, detail="No questions found in this training")

    # Score answers
    correct_count = 0
    for answer in payload.answers:
        expected = correct_map.get(answer.question_id)
        if expected is not None and answer.selected_index == expected:
            correct_count += 1

    total = len(correct_map)
    score = round((correct_count / total) * 100)
    passed = score >= 80

    # Upsert progress record
    prog = _get_progress(training_id, current_user.id, db)
    if prog:
        prog.score = score
        prog.completed = passed
        prog.completed_at = datetime.utcnow() if passed else None
    else:
        prog = Progress(
            user_id=current_user.id,
            training_id=training_id,
            score=score,
            completed=passed,
            completed_at=datetime.utcnow() if passed else None,
        )
        db.add(prog)

    db.commit()
    return QuizResult(score=score, passed=passed)
