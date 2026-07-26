package pricing

import "testing"

func TestParsePrice(t *testing.T) {
	amount, err := ParsePrice("42")
	if err != nil || amount != 42 {
		t.Fatalf("ParsePrice() = %d, %v; want 42, nil", amount, err)
	}
}
