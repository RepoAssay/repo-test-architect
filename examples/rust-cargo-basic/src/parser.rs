pub fn parse_price(value: &str) -> Result<u64, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("price is required".to_owned());
    }

    trimmed
        .parse::<u64>()
        .map_err(|_| "price must be a positive integer".to_owned())
}
