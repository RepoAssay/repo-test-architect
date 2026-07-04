def validate_order(payload):
    if not payload.get("items"):
        raise ValueError("Missing items")

    return True

