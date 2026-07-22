package com.example.shipping;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class ShipmentValidatorTest {
  @Test
  void acceptsPositiveWeightAndDestination() {
    ShipmentValidator validator = new ShipmentValidator();

    assertTrue(validator.canShip(new ShipmentRequest(500, "SE")));
  }
}
