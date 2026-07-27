mod formatter;

pub fn render(value: u64) -> String {
    formatter::format_total(value)
}
