pub struct Calculator;

impl Calculator {
    pub fn total(subtotal: u64, tax: u64) -> u64 {
        subtotal + tax
    }
}
