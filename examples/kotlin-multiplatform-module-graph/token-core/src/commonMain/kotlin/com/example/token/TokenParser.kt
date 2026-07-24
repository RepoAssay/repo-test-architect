package com.example.token

class TokenParser {
    fun parse(value: String): String? = if (value.isBlank()) null else value.trim()
}
