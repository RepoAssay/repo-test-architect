using CheckoutRules;

namespace CheckoutRules.Tests;

public sealed class DiscountCalculatorTests
{
    [Fact]
    public void AppliesDiscount()
    {
        Assert.Equal(80m, DiscountCalculator.Apply(100m, 20m));
    }
}
