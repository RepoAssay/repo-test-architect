use custom_targets::validator::valid_subtotal;

#[test]
fn validates_a_positive_subtotal() {
    assert!(valid_subtotal(42));
}
