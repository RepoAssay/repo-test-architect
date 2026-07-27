pub fn checkout_total(subtotal: u64, discount: Option<u64>) -> Result<u64, String> {
    match discount {
        Some(value) if value > subtotal => Err("discount exceeds subtotal".to_owned()),
        Some(value) => Ok(subtotal - value),
        None => Ok(subtotal),
    }
}
