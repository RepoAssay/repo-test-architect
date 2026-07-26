package checkout

import "testing"

func TestCheckout(t *testing.T) {
	amount, err := Checkout("42")
	if err != nil || amount != 42 {
		t.Fatalf("Checkout() = %d, %v; want 42, nil", amount, err)
	}
}
