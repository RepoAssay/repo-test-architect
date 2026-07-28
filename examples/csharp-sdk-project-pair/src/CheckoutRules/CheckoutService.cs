namespace CheckoutRules;

public sealed class CheckoutService
{
    public decimal Total(decimal subtotal, bool isPriorityCustomer)
    {
        if (subtotal < 0) throw new ArgumentOutOfRangeException(nameof(subtotal));
        return isPriorityCustomer ? subtotal * 0.9m : subtotal;
    }
}
