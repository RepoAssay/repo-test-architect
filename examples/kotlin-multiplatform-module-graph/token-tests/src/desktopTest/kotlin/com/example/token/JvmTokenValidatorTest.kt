package com.example.token

import kotlin.test.Test
import kotlin.test.assertTrue

class JvmTokenValidatorTest {
    @Test
    fun acceptsLowercaseTokens() {
        assertTrue(JvmTokenValidator().isValid("alpha"))
    }
}
