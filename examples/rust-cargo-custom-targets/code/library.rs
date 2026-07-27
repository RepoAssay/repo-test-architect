pub fn calculate_total(subtotal: u64, discount: Option<u64>) -> Result<u64, String> {
    match discount {
        Some(value) if value > subtotal => Err("discount exceeds subtotal".to_owned()),
        Some(value) => Ok(subtotal - value),
        None => Ok(subtotal),
    }
}

#[cfg(test)]
mod tests {
    use super::calculate_total;

    #[test]
    fn applies_a_discount() {
        assert_eq!(calculate_total(42, Some(2)), Ok(40));
    }
}
