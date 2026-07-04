package com.example.invoice;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class MoneyFormatter {
  public String format(int amountInCents, String currency) {
    BigDecimal amount = BigDecimal.valueOf(amountInCents)
      .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);

    return currency + " " + amount;
  }
}
