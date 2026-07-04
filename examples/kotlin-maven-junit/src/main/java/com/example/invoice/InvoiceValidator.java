package com.example.invoice;

public final class InvoiceValidator {
  public boolean isValid(InvoiceRequest request) {
    return request != null && request.amountInCents() > 0 && request.currency() != null && !request.currency().isBlank();
  }
}
