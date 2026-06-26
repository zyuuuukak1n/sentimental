# backend/app/models.py
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    is_guest = Column(Boolean, default=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(String, nullable=True)
    auth_provider = Column(String, nullable=True)
    provider_id = Column(String, nullable=True, unique=True)
    name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    # 【修正】DBの型に合わせてタイムゾーン情報を安全に除去してから保存する
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

class GuestMerge(Base):
    __tablename__ = "guest_merges"

    guest_id = Column(UUID(as_uuid=True), primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    # 【修正】
    merged_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

class Reaction(Base):
    __tablename__ = "reactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    emoji_code = Column(String, nullable=False)
    click_count = Column(Integer, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    # 【修正】
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))