use checkout_rules::parser::parse_price;

#[test]
fn parses_a_trimmed_price() {
    assert_eq!(parse_price(" 42 "), Ok(42));
}
