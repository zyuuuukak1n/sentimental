# backend/app/main.py
import json # JSON（データを文字として送受信するための世界標準フォーマット）を扱うライブラリ
import asyncio  # 定期実行の非同期処理を行うための標準ライブラリ
import uuid # ユーザーごとの絶対に被らない一意のIDを生成するためのライブラリ
import os # .envから環境変数を読み込むためのライブラリ
import httpx # Googleのサーバーに通信を送るためのライブラリ
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import time
from typing import List
from .database import engine, Base, AsyncSessionLocal
from . import models
from .auth import create_access_token, get_current_user, ACCESS_TOKEN_EXPIRE_MINUTES
from datetime import timedelta
from sqlalchemy import select, func
import emoji
from passlib.context import CryptContext
from pydantic import BaseModel

# bcryptアルゴリズムを使用した協力なパスワードハッシュ化設定
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    """入力されたパスワードと、DBの暗号化パスワードが一致するか検証する"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    """パスワードを復元不可能な文字列（ハッシュ）に変換する"""
    return pwd_context.hash(password)

# フロントエンドから送られてくる「新規登録データ」の形を厳格に定義
class UserCreate(BaseModel):
    email: str
    password: str
    name: str

class userLogin(BaseModel):
    email: str
    password: str

# ---------------------------------------------------------
# ▼ FastAPIのライフサイクル（起動・終了時の処理）
# ---------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # アプリ起動時に実行される処理
    async with engine.begin() as conn:
        # 定義したモデル（設計図）をもとに、DBにテーブルが存在しなければ作成する
        await conn.run_sync(Base.metadata.create_all)
    
    #【防御的設計】サーバー起動時に1回だけDBから累計を集計し、メモリにキャッシュする
    # 毎回DBに集計クエリを投げるとシステムが重くなるのを防ぐため
    async with AsyncSessionLocal() as db:
        # 各絵文字（emoji_code）ごとに、クリック数（click_count）の合計を計算（func.sum）するSQLを組み立てる
        stmt = select(models.Reaction.emoji_code, func.sum(models.Reaction.click_count)).group_by(models.Reaction.emoji_code)
        result = await db.execute(stmt)

        # 集計結果を ConnectionManager の total_counts にセットする
        for row in result:
            emoji = row[0]
            total = row[1]
            if emoji in manager.total_counts:
                # DBにデータがない場合は None になることがあるため、その場合は0にする
                manager.total_counts[emoji] = total or 0
    
    # サーバー起動と同時に、バッファ定期保存処理（flush_buffer_periodically）をバックグラウンドタスクとして開始
    flush_task = asyncio.create_task(manager.flush_buffer_periodically())

    yield   # ここでFastAPI本体が稼働し続ける

    # アプリ終了時に実行される処理
    flush_task.cancel() # サーバー終了時は、エラーが出ないようにタスクを安全にキャンセル（停止）する
    await engine.dispose()  # DBとの接続を安全に切断

app = FastAPI(title="Sentimental API", lifespan=lifespan)

# レートリミットの設定
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORSの厳密な設定
frontend_url_env = os.environ.get("FRONTEND_URL", "http://localhost:3000,http://127.0.0.1:3000")
origins = [url.strip() for url in frontend_url_env.split(",") if url.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"status": "ok", "message": "バックエンド正常稼働中、DB接続OK"}

# ---------------------------------------------------------
# ▼ Google OAuth認証エンドポイント
# ---------------------------------------------------------
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
# Googleのログイン画面からの戻ってくるためのURL
REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")

@app.get("/auth/google/login")
@limiter.limit("5/minute")
async def login_via_google(request: Request):
    # ▼ 追加：【防御的設計】環境変数が空っぽのままGoogleに通信してしまうのを防ぐ
    # これが無いと、IDがNoneのままGoogleに送られ、今回のような 401 invalid_client エラーになります。
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=500, 
            detail="バックエンドの環境変数（GOOGLE_CLIENT_ID/SECRET）が正しく読み込めていません。.envファイルとdocker-composeの設定を確認してください。"
        )

    # ▼ 修正箇所2：「account.google.com」の複数形の s が抜けていたタイポを「accounts」に修正
    base_url = "https://accounts.google.com/o/oauth2/v2/auth"
    
    # URLのパラメータを綺麗に結合（前回の提案コードを適用します）
    params = (
        f"response_type=code"
        f"&client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={REDIRECT_URI}"
        f"&scope=openid%20profile%20email"
        f"&access_type=offline"
    )
    
    auth_url = f"{base_url}?{params}"
    return {"url": auth_url}

@app.get("/auth/google/callback")
@limiter.limit("5/minute")
async def auth_google_callback(request: Request, code: str):
    # ユーザーがGoogle画面で「許可」を押すと、GoogleからこのURLに「code（ワンタイムパスワードのようなもの）」が送られてくる。
    # この code と、誰にも見せていない client_secret を使って、裏側でGoogleからアクセストークンを貰う。
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
    }

    async with httpx.AsyncClient() as client:
        # トークンを要求
        token_res = await client.post(token_url, data=data)
        token_data = token_res.json()

        if "error" in token_data:
            raise HTTPException(status_code=400, detail="Google認証に失敗しました。")

        access_token = token_data.get("access_token")

        # 貰ったアクセストークンを使って、ユーザーのプロフィール情報を取得
        userinfo_url = "https://www.googleapis.com/oauth2/v2/userinfo"
        headers = {"Authorization": f"Bearer {access_token}"}
        user_res = await client.get(userinfo_url, headers=headers)
        user_info = user_res.json()

        #　動作確認用
        print("🎉 Googleユーザー情報取得成功:", user_info)

        # 本来はここでデータベースのゲストIDと紐付けを行いますが、今回はまず認証が通るかを確認するため、
        # フロントエンド（アプリの画面）にリダイレクトして戻します。
        
        # ユーザーIDを検索、または作成
        async with AsyncSessionLocal() as db:
            stmt = select(models.User).where(models.User.email == user_info.get("email"))
            result = await db.execute(stmt)
            user = result.scalar_one_or_none()

            if not user:
                # 新規登録
                user = models.User(
                    email=user_info.get("email"),
                    name=user_info.get("name"),
                    auth_provider="google",
                    provider_id=user_info.get("id"),
                    is_guest=False
                )
                db.add(user)
                await db.commit()
                await db.refresh(user)

        # JWTトークンを発行
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": str(user.id)}, expires_delta=access_token_expires
        )

        # セキュリティのため、フラグメント（#）を利用してトークンをフロントに渡す
        # 最初のフロントエンドURLをリダイレクト先として使用（本番環境対応）
        frontend_base = origins[0] if origins else "http://localhost:3000"
        # 念のため末尾の/を削除
        frontend_base = frontend_base.rstrip("/")
        return RedirectResponse(url=f"{frontend_base}/#token={access_token}&user_id={user.id}&name={user.name}")

# ---------------------------------------------------------
# ▼ メールアドレス・パスワード認証エンドポイント
# ---------------------------------------------------------
@app.post("/auth/register")
@limiter.limit("5/minute")
async def register_user(request: Request, user_data: UserCreate):
    async with AsyncSessionLocal() as db:
        # 1. 既に同じメールアドレスが登録されていないかチェック
        stmt = select(models.User).where(models.User.email == user_data.email)
        result = await db.execute(stmt)
        existing_user = result.scalar_one_or_none()

        if existing_user:
            raise HTTPException(status_code=400, detail="このメールアドレスは既に登録されています。")
        
        # 2. パスワードを暗号化
        hashed_pw = get_password_hash(user_data.password)

        # 3. 新規ユーザーとしてDBに保存
        new_user = models.User(
            email=user_data.email,
            hashed_password=hashed_pw,
            name=user_data.name,
            auth_provider="local",
            is_guest=False
        )
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)

        print(f"🎉 新規ユーザー登録成功: {new_user.email}")

        # JWTトークンを発行
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": str(new_user.id)}, expires_delta=access_token_expires
        )

        return {
            "status": "success", 
            "message": "登録が完了しました", 
            "user_id": str(new_user.id),
            "access_token": access_token,
            "token_type": "bearer"
        }

@app.post("/auth/login")
@limiter.limit("5/minute")
async def login_user(request: Request, user_data: userLogin):
    async with AsyncSessionLocal() as db:
        # 1. メールアドレスでユーザーを検索
        stmt = select(models.User).where(models.User.email == user_data.email)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

        # 2. ユーザーが存在しない or パスワードが間違っている場合の検証
        if not user or not user.hashed_password or not verify_password(user_data.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="メールアドレスまたはパスワードが間違っています。")
        
        print(f"🎉 ログイン成功: {user.email}")

        # JWTトークンを発行
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": str(user.id)}, expires_delta=access_token_expires
        )

        return {
            "status": "success", 
            "message": "ログインしました", 
            "user_id": str(user.id), 
            "name": user.name,
            "access_token": access_token,
            "token_type": "bearer"
        }

# ---------------------------------------------------------
# ▼ プロフィール・リアクション履歴の取得エンドポイント
# ---------------------------------------------------------
@app.get("/users/{user_id}/profile")
@limiter.limit("30/minute")
async def get_user_profile(request: Request, user_id: str, current_user: models.User = Depends(get_current_user)):
    """
    指定されたユーザーIDのプロフィールと、これまで送信した絵文字ごとの合計クリック数を返すAPI。
    IDOR対策として、リクエストしたユーザーのID（JWTから取得）とパスパラメータの user_id が一致するか検証する。
    """
    # 【防御的設計: IDOR対策】
    if str(current_user.id) != user_id:
        raise HTTPException(status_code=403, detail="他人のプロフィールにアクセスする権限がありません。")
    
    async with AsyncSessionLocal() as db:
        # ユーザーのリアクション履歴を集計
        stmt = select(models.Reaction.emoji_code, func.sum(models.Reaction.click_count)).where(models.Reaction.user_id == current_user.id).group_by(models.Reaction.emoji_code)
        result = await db.execute(stmt)
        
        # [{'emoji_code': '😡', 'total': 10}, ...] の形式に整形
        reactions_summary = [{"emoji_code": row[0], "total": row[1]} for row in result]

    return {
        "user": {
            "id": str(current_user.id),
            "name": current_user.name,
            "email": current_user.email,
            "avatar_url": current_user.avatar_url,
            "is_guest": current_user.is_guest,
            "created_at": current_user.created_at
        },
        "reactions_summary": reactions_summary
    }

# ---------------------------------------------------------
# ▼ WebSocketの接続状態を管理するクラス
# ---------------------------------------------------------
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.reaction_buffer = []   # 【防御的設計】DBへの過剰アクセスを防ぐため、クリックデータを一時的に溜め込むバッファ
        self.total_counts = {"😡": 0, "😭": 0, "🥺": 0} # 【防御的設計】DBへの問い合わせを減らすため、全絵文字の累計クリック数をメモリ上で保持する辞書
        self.last_message_time = {} # 【防御的設計】WebSocketの連打対策用タイムスタンプ記録

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
    def add_to_buffer(self, emoji: str, count: int, user_id: uuid.UUID, lat: float = None, lng: float = None):
        # 辞書型の形式で、誰がどの絵文字を何回押したかをリストに追加する
        self.reaction_buffer.append({
            "emoji_code": emoji,
            "click_count": count,
            "user_id": user_id,
            "latitude": lat,
            "longitude": lng
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
                            user_id=data["user_id"],
                            latitude=data["latitude"],
                            longitude=data["longitude"]
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
@app.websocket("/ws/reactions/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    # 1. クライアント（ブラウザ）からの接続要求を許可（ハンドシェイク）
    # →変更: マネージャー経由で接続を受け入れる
    await manager.connect(websocket)

    try:
        user_uuid = uuid.UUID(client_id)
    except ValueError:
        print(f"【警告】不正なIDでの接続試行を遮断しました: {client_id}")
        await websocket.close(code=1000)    # 1000 は「ポリシー違反」を示す切断コード
        return
    
    async with AsyncSessionLocal() as db:
        # このIDが既にデータベースに存在するか検索
        stmt = select(models.User).where(models.User.id == user_uuid)
        result = await db.execute(stmt)
        existing_user = result.scalar_one_or_none()

        # 存在しない場合のみ新規ゲストとしてDBに登録
        if not existing_user:
            new_user = models.User(id=user_uuid, is_guest=True)
            db.add(new_user)
            await db.commit()
    
    # ユーザーが接続してきた瞬間に、現在の「累計カウント」をその人だけに送る
    init_response = {
        "status": "init",
        "total_counts": manager.total_counts
    }
    await websocket.send_text(json.dumps(init_response, ensure_ascii=False))

    print(f"クライアントが接続しました。現在の接続数: {len(manager.active_connections)}")

    try:
        # While True: を使うことで、接続が切れるまで無限に待ち受け・処理を繰り返す
        while True:
            # 2. クライアントから送られていたテキストデータを受診するまで待機（await）
            data = await websocket.receive_text()

            # 3. 受診した単なる「文字列」を、Pythonで扱える「辞書型（dict）」に変換
            payload = json.loads(data)

            # 送られてきたデータを一旦変数で受け取る
            received_text = payload.get("emoji")
            count = payload.get("count", 1)
            lat = payload.get("latitude")
            lng = payload.get("longitude")

            # emoji.is_emoji() は、渡された文字が「完全に1つの絵文字」である場合のみ True を返す。
            if received_text and emoji.is_emoji(received_text) and count:
                
                # 【防御的設計】連打防止（スロットル処理）
                # 同じユーザーからの1秒間に5回以上（0.2秒間隔未満）の連続送信を無視する
                current_time = time.time()
                last_time = manager.last_message_time.get(user_uuid, 0)
                if current_time - last_time < 0.2:
                    continue
                manager.last_message_time[user_uuid] = current_time

                manager.add_to_buffer(received_text, count, user_uuid, lat, lng)

                if received_text in manager.total_counts:
                    manager.total_counts[received_text] += count
                else:
                    # まだ誰も押したことがない新しい絵文字が来た場合は、辞書に新規追加する
                    manager.total_counts[received_text] = count
                
                response = {
                    "status": "broadcast",
                    "received_emoji": received_text,
                    "click_count": count,
                    "latitude": lat,
                    "longitude": lng,
                    "total_counts": manager.total_counts
                }

                await manager.broadcast(json.dumps(response, ensure_ascii=False))
            else:
                #不正なデータが送られてきた場合は、サーバーのログにだけ残して警告する
                print(f"【警告】不正な絵文字データを受診し、破棄しました: {received_text}")
    
    # クライアントがブラウザを閉じるなどして通信が切れた場合のエラーハンドリング
    except WebSocketDisconnect:
        # →変更: 切断時の処理をマネージャーに任せる
        manager.disconnect(websocket)
        print(f"クライアントが切断されました。現在の接続数: {len(manager.active_connections)}")