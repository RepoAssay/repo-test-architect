def resolve_session(token):
    if not token:
        return None
    return {"token": token}
