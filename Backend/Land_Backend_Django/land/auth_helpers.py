from datetime import timedelta

import jwt
from django.conf import settings
from django.utils import timezone


APPLICANT_ROLE = "Applicant"
ADMINISTRATOR_ROLE = "Administrator"
APPLICANT_ROLE_ID = 1
ADMINISTRATOR_ROLE_ID = 2
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_LIFETIME = timedelta(minutes=60)
REFRESH_TOKEN_LIFETIME = timedelta(days=7)


def get_role_name(user):
    if not user or not getattr(user, "role", None):
        return None
    return user.role.role_name


def is_applicant(user):
    role_name = get_role_name(user)
    role_id = getattr(user, "role_id", None)
    return (
        role_id == APPLICANT_ROLE_ID
        or (role_name is not None and role_name.lower() == APPLICANT_ROLE.lower())
    )


def is_administrator(user):
    role_name = get_role_name(user)
    role_id = getattr(user, "role_id", None)
    return (
        role_id == ADMINISTRATOR_ROLE_ID
        or (role_name is not None and role_name.lower() == ADMINISTRATOR_ROLE.lower())
    )


def _jwt_payload(user, token_type, lifetime):
    now = timezone.now()
    role_name = get_role_name(user)
    return {
        "token_type": token_type,
        "user_id": user.user_id,
        "email": user.email,
        "role_id": user.role_id,
        "role_name": role_name,
        "iat": int(now.timestamp()),
        "exp": int((now + lifetime).timestamp()),
    }


def generate_jwt_pair(user):
    access_payload = _jwt_payload(user, "access", ACCESS_TOKEN_LIFETIME)
    refresh_payload = _jwt_payload(user, "refresh", REFRESH_TOKEN_LIFETIME)
    return {
        "access": jwt.encode(access_payload, settings.SECRET_KEY, algorithm=JWT_ALGORITHM),
        "refresh": jwt.encode(refresh_payload, settings.SECRET_KEY, algorithm=JWT_ALGORITHM),
    }


def decode_custom_jwt_token(token):
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[JWT_ALGORITHM])
