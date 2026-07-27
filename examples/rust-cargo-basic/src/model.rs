#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CheckoutRequest {
    pub subtotal: u64,
    pub coupon: Option<String>,
}
