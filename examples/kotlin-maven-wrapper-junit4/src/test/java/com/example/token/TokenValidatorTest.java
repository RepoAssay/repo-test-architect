package com.example.token;

import org.junit.Test;

import static com.example.token.TokenValidator.valid;
import static org.junit.Assert.assertTrue;

public class TokenValidatorTest {
  @Test
  public void acceptsLongTokens() {
    assertTrue(valid("abcdefgh"));
  }
}
