package com.example.token

import io.kotest.core.spec.style.FunSpec
import io.kotest.matchers.shouldBe

class TokenParserSpec : FunSpec({
    test("trims a valid token") {
        val parser = TokenParser()
        val result = parser.parse(" valid ")

        result shouldBe "valid"
    }
})
