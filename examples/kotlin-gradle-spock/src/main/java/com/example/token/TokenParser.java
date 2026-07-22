package com.example.token;

public class TokenParser {
    public String parse(String value) {
        return value == null ? "" : value.trim();
    }
}
