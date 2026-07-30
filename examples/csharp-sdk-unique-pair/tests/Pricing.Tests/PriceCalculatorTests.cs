using Pricing;

namespace Pricing.Tests;

public sealed class PriceCalculatorTests
{
    private readonly PriceCalculator calculator = new();

    [Fact]
    public void CalculatesTheTotal()
    {
        Assert.Equal(12m, calculator.Total(4m, 3));
    }
}
