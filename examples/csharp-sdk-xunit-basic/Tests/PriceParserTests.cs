namespace CheckoutRules.Tests;

public class PriceParserTests
{
    [Fact]
    public void ParsesTrimmedPrices()
    {
        Assert.Equal(42, PriceParser.Parse(" 42 "));
    }
}
