using Pricing;

namespace Pricing.Tests;

public sealed class PriceCalculatorTests
{
    [Fact]
    public void CalculatesTheTotal()
    {
        var calculator = new PriceCalculator();

        Assert.Equal(12m, calculator.Total(4m, 3));
    }
}
