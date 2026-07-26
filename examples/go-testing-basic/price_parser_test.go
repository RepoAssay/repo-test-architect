package checkout

import "testing"

func TestParsePrice(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  int
	}{
		{name: "whole number", value: " 42 ", want: 42},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := ParsePrice(test.value)
			if err != nil {
				t.Fatalf("ParsePrice returned an error: %v", err)
			}
			if got != test.want {
				t.Fatalf("ParsePrice returned %d, want %d", got, test.want)
			}
		})
	}
}
