package com.example.checkout;

public class MoneyFormatter {
    public String cents(int cents) {
        int whole = cents / 100;
        int remainder = Math.abs(cents % 100);
        return "$" + whole + "." + String.format("%02d", remainder);
    }
}
