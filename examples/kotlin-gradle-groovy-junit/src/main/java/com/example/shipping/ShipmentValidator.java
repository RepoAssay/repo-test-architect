package com.example.shipping;

public final class ShipmentValidator {
  public boolean canShip(ShipmentRequest request) {
    return request != null && request.weightInGrams() > 0 && request.destinationCountry() != null;
  }
}
