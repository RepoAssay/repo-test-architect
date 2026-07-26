package checkout

import "strings"

func normalizePrice(value string) string {
	return strings.TrimSpace(value)
}
