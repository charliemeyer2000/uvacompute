package lib

import (
	"net/http/httptest"
	"testing"
)

func TestValidatePowerOfTwoOrError(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name    string
		value   int
		isValid bool
	}{
		{"zero is valid", 0, true},
		{"one is valid", 1, true},
		{"two is valid", 2, true},
		{"three is invalid", 3, false},
		{"four is valid", 4, true},
		{"five is invalid", 5, false},
		{"seven is invalid", 7, false},
		{"eight is valid", 8, true},
		{"sixteen is valid", 16, true},
		{"negative is valid (only positive non-powers are rejected)", -1, true},
		{"large power of 2", 1024, true},
		{"large non-power of 2", 1023, false},
		{"six is invalid", 6, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			w := httptest.NewRecorder()
			result := ValidatePowerOfTwoOrError(w, tt.value, "testField")

			if result != tt.isValid {
				t.Errorf("ValidatePowerOfTwoOrError(%d) = %v, want %v", tt.value, result, tt.isValid)
			}

			if !tt.isValid {
				if w.Code != 400 {
					t.Errorf("expected 400 status code, got %d", w.Code)
				}
			}
		})
	}
}
