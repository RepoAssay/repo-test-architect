//go:build integration && (darwin || linux)

package platform

import "testing"

func TestCalculateTax(t *testing.T) {
	if tax := CalculateTax(100); tax != 20 {
		t.Fatalf("CalculateTax() = %d; want 20", tax)
	}
}
