//go:build integration && (darwin || linux)

package platform

func CalculateTax(amount int) int {
	return amount / 5
}
