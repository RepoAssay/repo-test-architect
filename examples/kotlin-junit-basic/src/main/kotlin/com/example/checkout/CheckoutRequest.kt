package com.example.checkout

data class CheckoutRequest(
    val itemCents: Int,
    val quantity: Int,
    val discountCode: String?
)
