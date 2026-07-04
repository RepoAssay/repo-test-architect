def parse_quantity(payload):
    if "quantity" not in payload:
        raise ValueError("Missing quantity")

    return int(payload["quantity"])

