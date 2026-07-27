package checkout

import (
	"fmt"
	"strconv"

	"example.com/checkout/internal/currency"
)

func ParsePrice(value string) (int, error) {
	trimmed := normalizePrice(value)
	if trimmed == "" {
		return 0, fmt.Errorf("price is required")
	}

	price, err := strconv.Atoi(trimmed)
	if err != nil || !currency.Valid(price) {
		return 0, fmt.Errorf("invalid price")
	}
	return price, nil
}
