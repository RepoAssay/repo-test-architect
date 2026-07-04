class DiscountService:
    def apply(self, gateway, customer_id, total):
        discount = gateway.lookup_discount(customer_id)
        if discount is None:
            return total

        return total - discount

