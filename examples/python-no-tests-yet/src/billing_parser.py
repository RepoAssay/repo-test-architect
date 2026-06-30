def parse_invoice_total(payload):
    if "total" not in payload:
        raise ValueError("Missing total")

    return int(payload["total"])
