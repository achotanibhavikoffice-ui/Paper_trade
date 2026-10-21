from datetime import datetime, timedelta, timezone
import hashlib
import hmac
from uuid import UUID

import jwt
from pwdlib import PasswordHash

from app.config import settings

password_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


def password_fingerprint(password_hash: str) -> str:
    return hmac.new(settings.jwt_secret.encode(), password_hash.encode(), hashlib.sha256).hexdigest()


def create_session_token(user_id: UUID, password_hash: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "pwd": password_fingerprint(password_hash),
        "iss": "quantx-api",
        "aud": "quantx-web",
        "iat": now,
        "exp": now + timedelta(days=settings.session_lifetime_days),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def read_session_identity(token: str) -> tuple[UUID, str] | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], issuer="quantx-api", audience="quantx-web")
        return UUID(payload["sub"]), str(payload["pwd"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
