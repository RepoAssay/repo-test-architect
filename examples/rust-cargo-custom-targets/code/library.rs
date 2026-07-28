pub mod validator;

#[path = "../shared/tax.rs"]
mod tax;

pub fn calculate_total(subtotal: u64, discount: Option<u64>) -> Result<u64, String> {
    if !validator::valid_subtotal(subtotal) {
        return Err("subtotal must be positive".to_owned());
    }
    match discount {
        Some(value) if value > subtotal => Err("discount exceeds subtotal".to_owned()),
        Some(value) => Ok(tax::apply(subtotal - value)),
        None => Ok(tax::apply(subtotal)),
    }
}

#[cfg(test)]
mod tests {
    use crate::validator::valid_subtotal;

    use super::calculate_total;

    #[test]
    fn applies_a_discount() {
        assert_eq!(calculate_total(42, Some(2)), Ok(40));
        assert!(valid_subtotal(42));
    }
}
