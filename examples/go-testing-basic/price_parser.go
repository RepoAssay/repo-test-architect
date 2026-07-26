package checkout

import (
	"fmt"
	"strconv"
	"strings"
)

func ParsePrice(value string) (int, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return 0, fmt.Errorf("price is required")
	}

	price, err := strconv.Atoi(trimmed)
	if err != nil || price < 0 {
		return 0, fmt.Errorf("invalid price")
	}
	return price, nil
}
