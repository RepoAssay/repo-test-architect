using Pricing;

namespace Pricing.Tests;

public sealed class PriceCalculatorTests
{
    private readonly PriceCalculator calculator = new();

    [Fact]
    public void CalculatesTheTotal()
    {
        calculator.TryTotal(4m, 3, out var total);

        Assert.Equal(12m, total);
    }
}
