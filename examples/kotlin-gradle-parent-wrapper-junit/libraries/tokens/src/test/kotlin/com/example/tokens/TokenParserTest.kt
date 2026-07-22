package com.example.tokens

import kotlin.test.Test
import kotlin.test.assertEquals

class TokenParserTest {
  @Test
  fun parsesTokens() {
    val parser = TokenParser()
    assertEquals("token", parser.parse(" token "))
  }
}
