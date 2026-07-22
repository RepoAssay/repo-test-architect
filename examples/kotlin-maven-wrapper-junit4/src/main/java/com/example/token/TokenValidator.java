package com.example.token;

public final class TokenValidator {
  private TokenValidator() {
  }

  public static boolean valid(String token) {
    return token != null && !token.isBlank() && token.length() >= 8;
  }
}
