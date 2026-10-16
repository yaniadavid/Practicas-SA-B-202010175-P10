package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPetLookupAndInjectedFailure(t *testing.T) {
	tests := []struct {
		name     string
		petID    string
		mode     string
		expected int
	}{
		{name: "known pet", petID: "pet-001", expected: http.StatusOK},
		{name: "unknown pet", petID: "pet-missing", expected: http.StatusNotFound},
		{name: "candidate failure", petID: "pet-001", mode: "error", expected: http.StatusServiceUnavailable},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("P10_FAULT_MODE", test.mode)
			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/pets/"+test.petID, nil)
			petByIDHandler(response, request)
			if response.Code != test.expected {
				t.Fatalf("GET /pets/%s with mode %q: got %d, want %d", test.petID, test.mode, response.Code, test.expected)
			}
		})
	}
}
