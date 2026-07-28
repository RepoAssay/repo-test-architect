namespace CheckoutRules;

public static class PriceParser
{
    public static int Parse(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException("A price is required.", nameof(value));
        }

        return int.Parse(value.Trim());
    }
}
