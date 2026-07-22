package com.example.token;

import java.util.Locale;

public final class TokenFormatter {
    public String format(String value) {
        return value.isBlank() ? "<empty>" : value.trim().toLowerCase(Locale.ROOT);
    }
}
