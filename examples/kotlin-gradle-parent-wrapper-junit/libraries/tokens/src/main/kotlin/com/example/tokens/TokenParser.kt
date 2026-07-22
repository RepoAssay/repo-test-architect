package com.example.tokens

class TokenParser {
  fun parse(value: String): String? = if (value.isBlank()) null else value.trim()
}
