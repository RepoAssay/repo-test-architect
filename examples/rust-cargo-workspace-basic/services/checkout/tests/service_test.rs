use workspace_checkout::service::checkout_total;

#[test]
fn totals_a_checkout() {
    assert_eq!(checkout_total("25", 2), Ok(50));
}
