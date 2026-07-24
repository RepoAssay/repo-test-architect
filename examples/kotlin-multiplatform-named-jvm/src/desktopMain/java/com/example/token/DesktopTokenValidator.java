package com.example.token;

public final class DesktopTokenValidator {
    public boolean isValid(String value) {
        return value != null && value.matches("[a-z]+");
    }
}
