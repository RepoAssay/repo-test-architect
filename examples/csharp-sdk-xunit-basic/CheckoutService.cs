namespace CheckoutRules;

public static class CheckoutService
{
    public static int Total(int subtotal, int? discount)
    {
        if (discount > subtotal)
        {
            throw new ArgumentOutOfRangeException(nameof(discount));
        }

        return subtotal - (discount ?? 0);
    }
}
