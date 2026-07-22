from shop.views import status


def test_status_response(request):
    response = status(request)
    assert response.status_code == 200
