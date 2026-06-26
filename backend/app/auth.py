import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from .database import AsyncSessionLocal
from . import models

# 環境変数から秘密鍵を取得（デフォルトは開発用のダミー鍵、本番では強力な乱数を使用）
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "your_super_secret_key_for_development_only")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 1週間

# FastAPIの標準セキュリティ機能。ここからトークンを抽出する
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """エンコードされたJWTを生成する"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """APIのリクエストヘッダからJWTを検証し、DBのユーザーを取得する"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="認証トークンが無効か、有効期限が切れています。",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception

    async with AsyncSessionLocal() as db:
        stmt = select(models.User).where(models.User.id == user_id)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception
    
    return user
