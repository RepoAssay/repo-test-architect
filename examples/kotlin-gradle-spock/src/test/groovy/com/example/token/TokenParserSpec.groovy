package com.example.token

import spock.lang.Specification

class TokenParserSpec extends Specification {
    def "trims a token before parsing"() {
        given:
        def parser = new TokenParser()

        when:
        def result = parser.parse(" token ")

        then:
        result == "token"
    }
}
