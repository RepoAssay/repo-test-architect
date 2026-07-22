package com.example.token

import kotlin.test.Test
import kotlin.test.assertEquals

class TokenParserTest {
  @Test
  fun parsesTokensAcrossTheModuleBoundary() {
    assertEquals("token", TokenParser().parse(" token "))
  }
}
