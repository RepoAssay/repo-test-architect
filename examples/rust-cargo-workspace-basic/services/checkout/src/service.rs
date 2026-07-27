use workspace_pricing::parser::parse_price;

pub fn checkout_total(value: &str, quantity: u64) -> Result<u64, &'static str> {
    parse_price(value).map(|price| price * quantity)
}
