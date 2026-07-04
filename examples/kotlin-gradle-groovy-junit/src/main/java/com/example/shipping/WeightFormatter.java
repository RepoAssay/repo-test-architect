package com.example.shipping;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class WeightFormatter {
  public String kilograms(int grams) {
    BigDecimal weight = BigDecimal.valueOf(grams)
      .divide(BigDecimal.valueOf(1000), 3, RoundingMode.HALF_UP);

    return weight + " kg";
  }
}
