def parse_user(payload):
    if "id" not in payload:
        raise ValueError("Missing id")
    return payload["id"]
