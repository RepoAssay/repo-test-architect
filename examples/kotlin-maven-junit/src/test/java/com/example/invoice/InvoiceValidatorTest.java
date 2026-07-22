package com.example.invoice;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class InvoiceValidatorTest {
  @Test
  void acceptsPositiveInvoicesWithACurrency() {
    InvoiceValidator validator = new InvoiceValidator();

    assertTrue(validator.isValid(new InvoiceRequest(100, "SEK")));
  }
}
