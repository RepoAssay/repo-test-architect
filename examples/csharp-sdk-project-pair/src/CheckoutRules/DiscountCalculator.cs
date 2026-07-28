namespace CheckoutRules;

public static class DiscountCalculator
{
    public static decimal Apply(decimal subtotal, decimal discount)
    {
        if (discount < 0 || discount > subtotal) throw new ArgumentOutOfRangeException(nameof(discount));
        return subtotal - discount;
    }
}
