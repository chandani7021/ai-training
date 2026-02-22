"""add_job_id_and_progress_message_to_documents

Revision ID: a3f2c1d4e5b6
Revises: 65b8a86f67d0
Create Date: 2026-02-18 06:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3f2c1d4e5b6'
down_revision: Union[str, Sequence[str], None] = '65b8a86f67d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('job_id', sa.String(), nullable=True))
    op.add_column('documents', sa.Column('progress_message', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('documents', 'progress_message')
    op.drop_column('documents', 'job_id')
