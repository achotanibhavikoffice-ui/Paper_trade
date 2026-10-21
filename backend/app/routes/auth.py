from datetime import datetime, timedelta, timezone
from decimal import Decimal
import hmac
import secrets
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.mail import send_password_reset_email
from app.models import Account, CashLedger, PasswordResetToken, User
from app.schemas import (
    AuthResponse,
    ForgotPasswordInput,
    LoginInput,
    ProfileUpdateInput,
    RegisterInput,
    ResetPasswordInput,
    UserResponse,
)
from app.security import (
    create_session_token,
    hash_password,
    hash_reset_token,
    password_fingerprint,
    read_session_identity,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
RESET_TOKEN_LIFETIME = timedelta(minutes=30)
RESET_EMAIL_COOLDOWN = timedelta(seconds=60)
GENERIC_RESET_MESSAGE = "If an account exists for that email, a password reset link will be sent shortly."


def generate_account_number() -> str:
    chars = "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(8))
    return f"TRD-{chars}"


def create_initial_account_for_user(user: User, db: Session) -> Account:
    existing = db.scalar(select(Account).where(Account.user_id == user.id))
    if existing:
        return existing
    initial_capital = Decimal("100000.00")
    account = Account(
        user_id=user.id,
        account_number=generate_account_number(),
        account_type="PAPER",
        currency="INR",
        initial_capital=initial_capital,
        cash_balance=initial_capital,
        status="ACTIVE",
    )
    db.add(account)
    db.flush()
    ledger_entry = CashLedger(
        account_id=account.id,
        entry_type="INITIAL_CAPITAL",
        amount=initial_capital,
        balance_after=initial_capital,
        description="Initial virtual capital grant",
        idempotency_key=f"INIT_CAPITAL_{user.id}",
    )
    db.add(ledger_entry)
    db.commit()
    db.refresh(account)
    return account


def set_session_cookie(response: Response, user: User) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=create_session_token(user.id, user.password_hash),
        max_age=settings.session_lifetime_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.session_cookie_secure or settings.app_env == "production",
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        httponly=True,
        secure=settings.session_cookie_secure or settings.app_env == "production",
        samesite="lax",
        path="/",
    )


def get_current_user(request: Request, response: Response, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(settings.session_cookie_name)
    identity = read_session_identity(token) if token else None
    if identity is None:
        clear_session_cookie(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to continue.")

    user_id, token_password_fingerprint = identity
    user = db.get(User, user_id)
    if user is None or not hmac.compare_digest(token_password_fingerprint, password_fingerprint(user.password_hash)):
        clear_session_cookie(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to continue.")
    return user


def get_current_user_optional(request: Request, response: Response, db: Session = Depends(get_db)) -> User | None:
    token = request.cookies.get(settings.session_cookie_name)
    identity = read_session_identity(token) if token else None
    if identity is None:
        return None

    user_id, token_password_fingerprint = identity
    user = db.get(User, user_id)
    if user is None or not hmac.compare_digest(token_password_fingerprint, password_fingerprint(user.password_hash)):
        return None
    return user


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterInput, response: Response, db: Session = Depends(get_db)) -> AuthResponse:
    user = User(name=payload.name, email=str(payload.email), password_hash=hash_password(payload.password))
    db.add(user)
    try:
        db.flush()
        initial_capital = Decimal("100000.00")
        account = Account(
            user_id=user.id,
            account_number=generate_account_number(),
            account_type="PAPER",
            currency="INR",
            initial_capital=initial_capital,
            cash_balance=initial_capital,
            status="ACTIVE",
        )
        db.add(account)
        db.flush()

        ledger_entry = CashLedger(
            account_id=account.id,
            entry_type="INITIAL_CAPITAL",
            amount=initial_capital,
            balance_after=initial_capital,
            description="Initial virtual capital grant",
            idempotency_key=f"INIT_CAPITAL_{user.id}",
        )
        db.add(ledger_entry)

        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.") from None
    except Exception:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Account initialization failed. Please try again.") from None

    set_session_cookie(response, user)
    return AuthResponse(user=UserResponse.model_validate(user))



@router.post("/login", response_model=AuthResponse)
def login(payload: LoginInput, response: Response, db: Session = Depends(get_db)) -> AuthResponse:
    user = db.scalar(select(User).where(User.email == str(payload.email)))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email or password is incorrect.")
    set_session_cookie(response, user)
    return AuthResponse(user=UserResponse.model_validate(user))


@router.get("/me", response_model=AuthResponse)
def me(user: User = Depends(get_current_user)) -> AuthResponse:
    return AuthResponse(user=UserResponse.model_validate(user))


@router.patch("/me", response_model=AuthResponse)
def update_profile(payload: ProfileUpdateInput, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> AuthResponse:
    user.name = payload.name
    db.commit()
    db.refresh(user)
    return AuthResponse(user=UserResponse.model_validate(user))


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(
    payload: ForgotPasswordInput,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    user = db.scalar(select(User).where(User.email == str(payload.email)).with_for_update())
    now = datetime.now(timezone.utc)

    if user:
        latest = db.scalar(
            select(PasswordResetToken)
            .where(PasswordResetToken.user_id == user.id)
            .order_by(PasswordResetToken.created_at.desc())
            .limit(1)
        )
        if latest and now - latest.created_at < RESET_EMAIL_COOLDOWN:
            return {"message": GENERIC_RESET_MESSAGE}

        db.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
        raw_token = secrets.token_urlsafe(32)
        reset_token = PasswordResetToken(
            user_id=user.id,
            token_hash=hash_reset_token(raw_token),
            expires_at=now + RESET_TOKEN_LIFETIME,
        )
        db.add(reset_token)
        db.commit()
        reset_url = f"{settings.frontend_origin.rstrip('/')}/reset-password?token={quote(raw_token, safe='')}"
        background_tasks.add_task(send_password_reset_email, user.email, reset_url)
    else:
        # Keep the response shape identical and avoid revealing whether an address is registered.
        secrets.token_bytes(32)

    return {"message": GENERIC_RESET_MESSAGE}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordInput, response: Response, db: Session = Depends(get_db)) -> dict[str, str]:
    now = datetime.now(timezone.utc)
    reset_token = db.scalar(
        select(PasswordResetToken)
        .where(
            PasswordResetToken.token_hash == hash_reset_token(payload.token),
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.revoked_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
        .with_for_update()
    )
    if reset_token is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This password reset link is invalid or has expired. Request a new one.")

    user = db.get(User, reset_token.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This password reset link is invalid or has expired. Request a new one.")

    user.password_hash = hash_password(payload.new_password)
    reset_token.used_at = now
    db.execute(
        delete(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.id != reset_token.id,
        )
    )
    db.commit()
    clear_session_cookie(response)
    return {"message": "Your password has been updated. Sign in with your new password."}


@router.post("/logout")
def logout(response: Response) -> dict[str, bool]:
    clear_session_cookie(response)
    return {"ok": True}
