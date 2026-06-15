package com.example.checkout

class CheckoutCalculator {
    fun totalCents(request: CheckoutRequest): Int {
        require(request.itemCents >= 0) { "itemCents must be non-negative" }
        require(request.quantity > 0) { "quantity must be positive" }

        val subtotal = request.itemCents * request.quantity
        return subtotal - discountCents(subtotal, request.discountCode)
    }

    private fun discountCents(subtotal: Int, discountCode: String?): Int {
        return when (discountCode) {
            "SAVE10" -> subtotal / 10
            "SAVE25" -> subtotal / 4
            else -> 0
        }
    }
}
