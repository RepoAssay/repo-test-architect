namespace CheckoutRules;

public sealed record CheckoutRequest(int Subtotal, int? Discount);
