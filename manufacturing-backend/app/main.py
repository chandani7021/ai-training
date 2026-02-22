from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from .auth.router import router as auth_router
from .routers.admin import router as admin_router
from .routers.employee import router as employee_router

# Create all tables (for development; in production use Alembic migrations)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Manufacturing SOP Training Platform",
    description="AI-powered SOP training generation and employee assessment",
    version="1.0.0",
)

# ---------------------------------------------------------------------------
# CORS – open for development; lock down allow_origins in production
# We use Bearer tokens (not cookies) so allow_credentials is not needed,
# which lets us use allow_origins=["*"] freely.
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(employee_router)


@app.get("/health")
def health():
    return {"status": "ok"}
