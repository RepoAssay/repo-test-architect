class CheckoutCalculator {
    fun totalWithTax(subtotal: Int, taxPercent: Int): Int {
        return subtotal + (subtotal * taxPercent / 100)
    }
}
