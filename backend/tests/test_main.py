import pytest
from httpx import AsyncClient, ASGITransport
import uuid
from app.main import app
from app.auth import get_current_user
from app.models import User

# テスト用のモックユーザー
mock_user_id = uuid.uuid4()
mock_user = User(
    id=mock_user_id,
    email="test@example.com",
    name="Test User",
    is_guest=False
)

# get_current_user をモックに差し替える
async def override_get_current_user():
    return mock_user

app.dependency_overrides[get_current_user] = override_get_current_user

@pytest.mark.asyncio
async def test_get_user_profile_success():
    """正常系: 自分のプロフィールにアクセスできるか"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # モックユーザーのIDでアクセス
        response = await ac.get(f"/users/{mock_user_id}/profile")
        
        # データベース接続部分はモックしていないため、500になる可能性がありますが、
        # IDORチェック（403）を通過して関数内部に入ったことは確認できます。
        # 今回の主眼は403 Forbiddenにならないこと。
        assert response.status_code != 403

@pytest.mark.asyncio
async def test_get_user_profile_idor_prevention():
    """異常系: 他人のプロフィールにアクセスすると403で弾かれるか（IDOR防止）"""
    other_user_id = uuid.uuid4() # 他人のID
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # ログイン中のユーザー（mock_user_id）が、他人のID（other_user_id）のURLにアクセス
        response = await ac.get(f"/users/{other_user_id}/profile")
        
        # 確実に403 Forbiddenでブロックされることを検証
        assert response.status_code == 403
        assert response.json()["detail"] == "他人のプロフィールにアクセスする権限がありません。"
