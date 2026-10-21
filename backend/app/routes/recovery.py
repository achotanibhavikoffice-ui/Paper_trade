from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.routes.auth import get_current_user
from app.schemas import (
    DisruptionSimulateInput,
    SafePointCreateInput,
    SafePointPreviewResponse,
    SafePointResponse,
    SafePointRollbackResponse,
)
from app.services.recovery_engine import recovery_engine

router = APIRouter(prefix="/api/recovery", tags=["recovery"])


@router.get("/safepoints", response_model=list[SafePointResponse])
def list_safepoints(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SafePointResponse]:
    """List recent portfolio SafePoints for the authenticated user's account."""
    safepoints = recovery_engine.list_safepoints(db, user, limit=limit)
    return [SafePointResponse.model_validate(sp) for sp in safepoints]


@router.post("/safepoints", response_model=SafePointResponse)
def create_safepoint(
    payload: SafePointCreateInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SafePointResponse:
    """Manually pin a new SafePoint snapshot of current cash, positions, and orders."""
    safepoint = recovery_engine.create_safepoint(
        db,
        user,
        name=payload.name,
        trigger_type="MANUAL",
        note=payload.note,
    )
    return SafePointResponse.model_validate(safepoint)


@router.get("/safepoints/{safepoint_id}", response_model=SafePointResponse)
def get_safepoint(
    safepoint_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SafePointResponse:
    """Get details for a specific SafePoint."""
    sp = recovery_engine.get_safepoint(db, user, safepoint_id)
    return SafePointResponse.model_validate(sp)


@router.get("/safepoints/{safepoint_id}/preview", response_model=SafePointPreviewResponse)
def preview_rollback(
    safepoint_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SafePointPreviewResponse:
    """Preview the exact diff (cash delta, positions reverted, orders cancelled) before executing rollback."""
    preview = recovery_engine.preview_rollback(db, user, safepoint_id)
    return SafePointPreviewResponse(**preview)


@router.post("/safepoints/{safepoint_id}/rollback", response_model=SafePointRollbackResponse)
def execute_rollback(
    safepoint_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SafePointRollbackResponse:
    """Atomically roll back the user's portfolio, ledger, positions, and orders to the SafePoint state."""
    result = recovery_engine.execute_rollback(db, user, safepoint_id)
    return SafePointRollbackResponse(**result)


@router.post("/simulate-disruption")
def simulate_disruption(
    payload: DisruptionSimulateInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """
    Demonstration endpoint for presentations and testing:
    Simulates buying shares (e.g. 50 TCS @ 1200), followed by an API/network crash,
    and returns an instant 1-click rollback recommendation to the captured SafePoint.
    """
    return recovery_engine.simulate_disruption(
        db,
        user,
        symbol=payload.symbol,
        quantity=payload.quantity,
        price=payload.price,
    )
