from pathlib import Path


class OrderRepository:
    def load_order(self, order_id):
        path = Path("orders") / f"{order_id}.json"
        if not path.exists():
            return None

        return path.read_text()

