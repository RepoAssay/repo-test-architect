class InventoryService:
    def reserve(self, repository, sku, quantity):
        if quantity <= 0:
            raise ValueError("Quantity must be positive")

        return repository.reserve(sku, quantity)

