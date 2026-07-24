package com.example.token

import kotlin.test.Test
import kotlin.test.assertEquals

class TokenParserTest {
    @Test
    fun trimsTokens() {
        assertEquals("alpha", TokenParser().parse(" alpha "))
    }
}
