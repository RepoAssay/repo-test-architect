use custom_targets::calculator::Calculator;

#[test]
fn calculates_an_associated_total() {
    assert_eq!(Calculator::total(40, 2), 42);
}
