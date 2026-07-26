package checkout

import "example.com/pricing"

func Checkout(rawPrice string) (int, error) {
	return pricing.ParsePrice(rawPrice)
}
