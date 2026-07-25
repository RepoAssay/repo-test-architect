from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_get_user():
    response = client.get("/v1/users/user-1?expanded=true")
    assert response.status_code == 200
