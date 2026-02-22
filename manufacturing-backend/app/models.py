from datetime import datetime
from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, DateTime, JSON, LargeBinary, UniqueConstraint
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # "admin" or "employee"
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    documents = relationship("Document", back_populates="uploader")
    assignments = relationship("Assignment", back_populates="user")
    progress_records = relationship("Progress", back_populates="user")


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    s3_url = Column(String, nullable=True)   # TODO: re-enable when S3 is configured
    file_data = Column(LargeBinary, nullable=True)  # PDF bytes stored in DB (S3 disabled)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    # Status flow: uploaded → processing → training_ready | failed
    status = Column(String, default="uploaded", nullable=False)
    error_message = Column(String, nullable=True)    # set when status = "failed"
    job_id = Column(String, nullable=True)           # RQ job id while processing
    progress_message = Column(String, nullable=True) # human-readable stage message
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    uploader = relationship("User", back_populates="documents")
    training = relationship("Training", back_populates="document", uselist=False)


class Training(Base):
    __tablename__ = "trainings"

    id = Column(Integer, primary_key=True, index=True)
    doc_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    title = Column(String, nullable=False)
    # Full training JSON: { "modules": [ { id, title, summary, content, quiz } ] }
    modules = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    document = relationship("Document", back_populates="training")
    assignments = relationship("Assignment", back_populates="training")
    progress_records = relationship("Progress", back_populates="training")


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    training_id = Column(Integer, ForeignKey("trainings.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("training_id", "user_id", name="uq_assignment"),)

    training = relationship("Training", back_populates="assignments")
    user = relationship("User", back_populates="assignments")


class Progress(Base):
    __tablename__ = "progress"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    training_id = Column(Integer, ForeignKey("trainings.id"), nullable=False)
    score = Column(Integer, nullable=True)
    completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)

    __table_args__ = (UniqueConstraint("user_id", "training_id", name="uq_progress"),)

    user = relationship("User", back_populates="progress_records")
    training = relationship("Training", back_populates="progress_records")
