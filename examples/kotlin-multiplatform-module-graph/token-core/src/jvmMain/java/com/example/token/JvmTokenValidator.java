package com.example.token;

public final class JvmTokenValidator {
    public boolean isValid(String value) {
        return value != null && value.matches("[a-z]+");
    }
}
