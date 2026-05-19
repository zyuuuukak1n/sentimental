# backend/app/main.py
from fastapi import FastAPI

app = FastAPI(title="Sentimental API")

@app.get("/")
async def root():
    return {"status": "ok", "message": "バックエンド正常稼働中"}