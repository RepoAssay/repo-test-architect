pub fn valid_coupon(value: &str) -> bool {
    value.len() >= 4
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
}

#[cfg(test)]
mod tests {
    use super::valid_coupon;

    #[test]
    fn accepts_a_normal_coupon() {
        assert!(valid_coupon("SAVE10"));
    }
}
