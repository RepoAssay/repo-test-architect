namespace CheckoutRules;

public sealed record CheckoutRequest(decimal Subtotal, bool IsPriorityCustomer);
