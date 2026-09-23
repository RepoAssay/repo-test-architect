def normalize_label(value):
    if not value:
        return "unknown"
    return value.strip()
