# backend/app/main.py
import json # JSON（データを文字として送受信するための世界標準フォーマット）を扱うライブラリ
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from contextlib import asynccontextmanager
from .database import engine, Base
from . import models

# ---------------------------------------------------------
# ▼ FastAPIのライフサイクル（起動・終了時の処理）
# ---------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # アプリ起動時に実行される処理
    async with engine.begin() as conn:
        # 定義したモデル（設計図）をもとに、DBにテーブルが存在しなければ作成する
        await conn.run_sync(Base.metadata.create_all)
    yield   # ここでFastAPI本体が稼働し続ける
    # アプリ終了時に実行される処理
    await engine.dispose()  # DBとの接続を安全に切断

app = FastAPI(title="Sentimental API", lifespan=lifespan)

@app.get("/")
async def root():
    return {"status": "ok", "message": "バックエンド正常稼働中、DB接続OK"}

# ---------------------------------------------------------
# ▼ WebSocket通信のエンドポイント（通信の窓口）
# ---------------------------------------------------------
# @app.websocket は、通常のHTTP（1回送って1回帰ってくる）ではなく、
# 「繋ぎっぱなし（双方向通信）」の経路を作るための設定
@app.websocket("/ws/reactions")
async def websocket_endpoint(websocket: WebSocket):
    # 1. クライアント（ブラウザ）からの接続要求を許可（ハンドシェイク）
    await websocket.accept()
    print("WebSocketクライアントが接続しました")

    try:
        # While True: を使うことで、接続が切れるまで無限に待ち受け・処理を繰り返す
        while True:
            # 2. クライアントから送られていたテキストデータを受診するまで待機（await）
            data = await websocket.receive_text()

            # 3. 受診した単なる「文字列」を、Pythonで扱える「辞書型（dict）」に変換
            payload = json.loads(data)

            # 4. 返信用のデータを作成
            # payload.get("emoji") は、もし"emoji"というキーが無ければエラーにならずに
            # None を返してくれる安全な書き方
            response = {
                "status": "echo",
                "received_emoji": payload.get("emoji"),
                "click_count": payload.get("count")
            }

            # 5. 辞書型のデータを再び「JSON文字列」に変換して、クライアントへ送信（やまびこ）
            await websocket.send_text(json.dumps(response, ensure_ascii=False))
    
    # クライアントがブラウザを閉じるなどして通信が切れた場合のエラーハンドリング
    except WebSocketDisconnect:
        print("クライアントとの接続が切断されました")