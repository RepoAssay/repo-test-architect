namespace Pricing;

public sealed class PriceCalculator
{
    public bool TryTotal(decimal price, int quantity, out decimal total)
    {
        total = Total(price, quantity);
        return true;
    }

    public decimal Total(decimal price, int quantity)
    {
        if (price < 0 || quantity < 0)
        {
            throw new ArgumentOutOfRangeException();
        }

        return price * quantity;
    }
}
