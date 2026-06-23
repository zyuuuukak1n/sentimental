<<<<<<< HEAD
# backend/Dockerfile
FROM python:3.12-slim

# セキュリティ: コンテナを非rootで実行するためのユーザー作成
RUN groupadd -r sentiuser && useradd -r -g sentiuser sentiuser

# 環境変数の設定（Pythonのバッファリング無効化など）
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/home/sentiuser/.local/bin:$PATH"

WORKDIR /app

# 依存関係のインストール（キャッシュを持たせずイメージサイズを削減）
# ※ requirements.txt には fastapi, uvicorn, sqlalchemy, asyncpg, redis などを記載想定
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# アプリケーションコードのコピーと権限変更
COPY . .
RUN chown -R sentiuser:sentiuser /app

# 非特権ユーザーに切り替え
USER sentiuser

=======
# backend/Dockerfile
FROM python:3.12-slim

# セキュリティ: コンテナを非rootで実行するためのユーザー作成
RUN groupadd -r sentiuser && useradd -r -g sentiuser sentiuser

# 環境変数の設定（Pythonのバッファリング無効化など）
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/home/sentiuser/.local/bin:$PATH"

WORKDIR /app

# 依存関係のインストール（キャッシュを持たせずイメージサイズを削減）
# ※ requirements.txt には fastapi, uvicorn, sqlalchemy, asyncpg, redis などを記載想定
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# アプリケーションコードのコピーと権限変更
COPY . .
RUN chown -R sentiuser:sentiuser /app

# 非特権ユーザーに切り替え
USER sentiuser

>>>>>>> 4bd6c21fa336a9254ffddb9384948f939f65dcc4
EXPOSE 8000