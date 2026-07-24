package com.example.token

import kotlin.test.Test
import kotlin.test.assertTrue

class DesktopTokenValidatorTest {
    @Test
    fun acceptsLowercaseTokens() {
        assertTrue(DesktopTokenValidator().isValid("alpha"))
    }
}
