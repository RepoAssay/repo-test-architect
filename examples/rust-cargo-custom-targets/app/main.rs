use custom_targets::calculate_total;

fn render_total(subtotal: u64, discount: Option<u64>) -> Result<String, String> {
    calculate_total(subtotal, discount).map(|total| format!("total: {total}"))
}

fn main() {
    if let Ok(total) = render_total(42, None) {
        println!("{total}");
    }
}
