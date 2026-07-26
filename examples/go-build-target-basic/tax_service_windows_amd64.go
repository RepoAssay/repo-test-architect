//go:build integration && windows

package platform

func CalculateTax(amount int) int {
	return amount / 4
}
