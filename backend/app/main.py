# backend/app/main.py
from fastapi import FastAPI
from contextlib import asynccontextmanager
from .database import engine, Base
from . import models # モデルを読み込ませる

# FastAPIの起動・終了時に実行される処理
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 起動時: テーブルが存在しなければ作成する
    async with engine.begin() as conn:
        # ※本番環境ではAlembic等のマイグレーションツールを使うが、初期開発時は自動生成で進める
        await conn.run_sync(Base.metadata.create_all)
    yield
    # 終了時: DBエンジンを閉じる
    await engine.dispose()

app = FastAPI(title="Sentimental API", lifespan=lifespan)

@app.get("/")
async def root():
    return {"status": "ok", "message": "バックエンド正常稼働中、DB接続OK"}