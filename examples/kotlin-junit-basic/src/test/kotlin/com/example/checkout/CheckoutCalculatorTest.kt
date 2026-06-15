package com.example.checkout

import kotlin.test.Test
import kotlin.test.assertEquals

class CheckoutCalculatorTest {
    private val calculator = CheckoutCalculator()

    @Test
    fun appliesKnownDiscountCode() {
        val total = calculator.totalCents(
            CheckoutRequest(itemCents = 1000, quantity = 2, discountCode = "SAVE10")
        )

        assertEquals(1800, total)
    }
}
