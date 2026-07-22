package com.example.token;

import org.testng.annotations.Test;

import static org.testng.Assert.assertEquals;

public final class TokenParserTest {
  @Test
  public void trimsValidTokens() {
    TokenParser parser = new TokenParser();
    String result = parser.parse(" valid ");

    assertEquals(result, "valid");
  }
}
