package com.example.shipping;

public record ShipmentRequest(int weightInGrams, String destinationCountry) {
}
