# frontend/Dockerfile
FROM node:20-alpine

WORKDIR /app

# package.json と package-lock.json を先にコピー（キャッシュ活用のため）
COPY package*.json ./

# 依存関係のクリーンインストール
RUN npm install

# コードのコピーと権限付与
COPY . .
RUN chown -R node:node /app

# 非特権ユーザーに切り替え
USER node

EXPOSE 3000

# 開発モードでの起動（ホットリロード有効）
CMD ["npm", "run", "dev"]