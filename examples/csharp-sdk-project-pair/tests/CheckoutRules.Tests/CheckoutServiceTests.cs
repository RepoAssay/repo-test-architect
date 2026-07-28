using CheckoutRules;

namespace CheckoutRules.Tests;

public sealed class CheckoutServiceTests
{
    [Fact]
    public void AppliesPriorityDiscount()
    {
        var service = new CheckoutService();
        var total = service.Total(100m, true);

        Assert.Equal(90m, total);
    }
}
