def parse_user_id(payload):
    if "id" not in payload:
        raise ValueError("Missing id")

    return str(payload["id"]).strip()
