from webapp.routes import status


def test_status_route():
    response = status()
    assert response.status_code == 200
