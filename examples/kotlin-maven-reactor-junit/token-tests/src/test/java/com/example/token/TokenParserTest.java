package com.example.token;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

final class TokenParserTest {
    @Test
    void parsesTokensAcrossTheModuleBoundary() {
        assertEquals("token", new TokenParser().parse(" token "));
    }
}
