package com.example.token

class TokenFormatter {
  fun format(value: String): String = if (value.isBlank()) "<empty>" else value.trim().lowercase()
}
