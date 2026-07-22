package com.example.token;

public class TokenFormatter {
    public String format(String value) {
        return value == null ? "" : value.trim();
    }
}
