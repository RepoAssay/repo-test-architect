package com.example.token;

public final class TokenParser {
  public String parse(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }
}
