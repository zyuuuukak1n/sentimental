# backend/app/main.py
import json # JSON（データを文字として送受信するための世界標準フォーマット）を扱うライブラリ
import asyncio  # 定期実行の非同期処理を行うための標準ライブラリ
import uuid # ユーザーごとの絶対に被らない一意のIDを生成するためのライブラリ
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from contextlib import asynccontextmanager
from typing import List
from .database import engine, Base, AsyncSessionLocal
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
    
    # サーバー起動と同時に、バッファ定期保存処理（flush_buffer_periodically）をバックグラウンドタスクとして開始
    flush_task = asyncio.create_task(manager.flush_buffer_periodically())

    yield   # ここでFastAPI本体が稼働し続ける

    # アプリ終了時に実行される処理
    flush_task.cancel() # サーバー終了時は、エラーが出ないようにタスクを安全にキャンセル（停止）する
    await engine.dispose()  # DBとの接続を安全に切断

app = FastAPI(title="Sentimental API", lifespan=lifespan)

@app.get("/")
async def root():
    return {"status": "ok", "message": "バックエンド正常稼働中、DB接続OK"}

# ---------------------------------------------------------
# ▼ WebSocketの接続状態を管理するクラス
# ---------------------------------------------------------
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.reaction_buffer = []   # 【防御的設計】DBへの過剰アクセスを防ぐため、クリックデータを一時的に溜め込むバッファ

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        
    async def broadcast(self, message: str):
        disconnected_clients = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                disconnected_clients.append(connection)
            
        for dead_conn in disconnected_clients:
            self.disconnect(dead_conn)
    
    # ▼ バッファにデータを追加する機能
    def add_to_buffer(self, emoji: str, count: int, user_id: uuid.UUID):
        # 辞書型の形式で、誰がどの絵文字を何回押したかをリストに追加する
        self.reaction_buffer.append({
            "emoji_code": emoji,
            "click_count": count,
            "user_id": user_id
        })
    
    # ▼ 定期的にバッファの中身をDBに一括保存（バルクインサート）する機能
    async def flush_buffer_periodically(self):
        # While True: でバックグラウンドで常に動き続けるようにする
        while True:
            # 5秒間待機する（これにより、DBへの書き込み頻度を「5秒に1回」に制限できる
            await asyncio.sleep(5)

            # バッファが空っぽ（誰もクリックしていない）なら、保存処理をスキップして再び5秒待つ
            if not self.reaction_buffer:
                continue
            
            # 現在のバッファの中身を別の変数（current_data）にコピーし、元のバッファは直ちに空にする
            # これにより、保存処理中も安全に新しいクリックデータを受け付けられる
            current_data = self.reaction_buffer.copy()
            self.reaction_buffer.clear()

            # データベース接続セッションを開く
            async with AsyncSessionLocal() as db:
                try:
                    # 溜まっていたデータ群から、保存用のReactionモデル（設計図）のリストを一気に作成
                    db_reactions = [
                        models.Reaction(
                            emoji_code=data["emoji_code"],
                            click_count=data["click_count"],
                            user_id=data[user_id]
                        ) for data in current_data
                    ]

                    # 【防御的設計】1件ずつ保存するのではなく、add_allで「一括保存（バルクインサート）」を実行
                    db.add_all(db_reactions)
                    await db.commit()   # 変更を確定させる
                    print(f"{len(db_reactions)}件のリアクションをデータベースに保存しました！")
                except Exception as e:
                    # 【防御的設計】万が一エラーが起きた場合は、データが中途半端に保存されないよう安全にロールバックする
                    print(f"データベース保存エラー: {e}")
                    await db.rollback()

# マネージャーのインスタンスを作成
manager = ConnectionManager()

# ---------------------------------------------------------
# ▼ WebSocket通信のエンドポイント（通信の窓口）
# ---------------------------------------------------------
# @app.websocket は、通常のHTTP（1回送って1回帰ってくる）ではなく、
# 「繋ぎっぱなし（双方向通信）」の経路を作るための設定
@app.websocket("/ws/reactions")
async def websocket_endpoint(websocket: WebSocket):
    # 1. クライアント（ブラウザ）からの接続要求を許可（ハンドシェイク）
    # →変更: マネージャー経由で接続を受け入れる
    await manager.connect(websocket)

    # 接続してきたユーザーに。一時的なゲストID（UUID）を発行
    guest_id = uuid.uuid4()

    # データベース（userテーブル）に、このゲストIDのレコードを登録しておく
    # ※これをしないと、Reaction保存時に「存在しないユーザーIDです」と外部キー制約エラーで弾かれる
    async with AsyncSessionLocal() as db:
        new_user = models.User(id=guest_id, is_guest=True)
        db.add(new_user)
        await db.commit()

    print(f"クライアントが接続しました。現在の接続数: {len(manager.active_connections)}")

    try:
        # While True: を使うことで、接続が切れるまで無限に待ち受け・処理を繰り返す
        while True:
            # 2. クライアントから送られていたテキストデータを受診するまで待機（await）
            data = await websocket.receive_text()

            # 3. 受診した単なる「文字列」を、Pythonで扱える「辞書型（dict）」に変換
            payload = json.loads(data)

            emoji = payload.get("emoji")
            count = payload.get("count")

            # 絵文字とカウントが正しく送られてきたら、保存用のバッファに突っ込む
            if emoji and count:
                manager.add_to_buffer(emoji, count, guest_id)

            # 4. 返信用のデータを作成
            # payload.get("emoji") は、もし"emoji"というキーが無ければエラーにならずに
            # None を返してくれる安全な書き方
            response = {
                "status": "broadcast",
                "received_emoji": payload.get("emoji"),
                "click_count": payload.get("count")
            }

            # 5. 辞書型のデータを再び「JSON文字列」に変換して、クライアントへ送信（やまびこ）
            # →変更: やまびこではなく、マネージャーを使って全員に一斉送信
            await manager.broadcast(json.dumps(response, ensure_ascii=False))
    
    # クライアントがブラウザを閉じるなどして通信が切れた場合のエラーハンドリング
    except WebSocketDisconnect:
        # →変更: 切断時の処理をマネージャーに任せる
        manager.disconnect(websocket)
        print(f"クライアントが切断されました。現在の接続数: {len(manager.active_connections)}")