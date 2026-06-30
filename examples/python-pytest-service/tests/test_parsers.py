from app.parsers import parse_user_id


def test_parse_user_id_trims_value():
    assert parse_user_id({"id": " user-1 "}) == "user-1"
