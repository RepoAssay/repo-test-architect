namespace Pricing;

public sealed class PriceCalculator
{
    public decimal Total(decimal price, int quantity)
    {
        if (price < 0 || quantity < 0)
        {
            throw new ArgumentOutOfRangeException();
        }

        return price * quantity;
    }
}
