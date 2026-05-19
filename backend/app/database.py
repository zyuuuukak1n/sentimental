# backend/app/database.py
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base

# docker-compose.ymlで設定した環境変数を取得
DATABASE_URL = os.getenv("DATABASE_URL")

# 非同期エンジンの作成
engine = create_async_engine(DATABASE_URL, echo=True) # echo=Trueで実行されたSQLがログに出る

# セッションメーカーの作成
AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

# モデルのベースクラス
Base = declarative_base()

# DBセッションを取得する依存性注入用関数
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session