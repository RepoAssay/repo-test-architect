package pricing

import "strconv"

func ParsePrice(raw string) (int, error) {
	return strconv.Atoi(raw)
}
