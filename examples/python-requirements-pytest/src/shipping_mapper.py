def map_shipping_method(payload):
    if payload.get("express"):
        return "EXPRESS"

    return "STANDARD"

