use custom_targets::calculate_total;

mod output;

fn render_total(subtotal: u64, discount: Option<u64>) -> Result<String, String> {
    calculate_total(subtotal, discount).map(output::render)
}

fn main() {
    if let Ok(total) = render_total(42, None) {
        println!("{total}");
    }
}
