pub fn parse_price(value: &str) -> Result<u64, &'static str> {
    value.parse().map_err(|_| "invalid price")
}

#[cfg(test)]
mod tests {
    use super::parse_price;

    #[test]
    fn rejects_invalid_prices() {
        assert_eq!(parse_price("nope"), Err("invalid price"));
    }
}
