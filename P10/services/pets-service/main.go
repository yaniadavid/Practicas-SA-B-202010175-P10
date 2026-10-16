package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

type Pet struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Species string `json:"species"`
	Breed   string `json:"breed"`
	OwnerID string `json:"ownerId"`
}

type graphQLRequest struct {
	Query string `json:"query"`
}

var pets = []Pet{
	{ID: "pet-001", Name: "Luna", Species: "Perro", Breed: "Labrador", OwnerID: "own-001"},
	{ID: "pet-002", Name: "Milo", Species: "Gato", Breed: "Siames", OwnerID: "own-002"},
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func petsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"message": "method not allowed"})
		return
	}
	writeJSON(w, http.StatusOK, pets)
}

func petByIDHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"message": "method not allowed"})
		return
	}
	if os.Getenv("P10_FAULT_MODE") == "slow" {
		trace.SpanFromContext(r.Context()).SetAttributes(attribute.String("p10.fault_mode", "slow"))
		jsonLog(r.Context(), "warn", "pet_lookup_injected_delay", map[string]any{"delay_ms": 2000})
		time.Sleep(2 * time.Second)
	}
	if os.Getenv("P10_FAULT_MODE") == "error" {
		jsonLog(r.Context(), "error", "pet_lookup_injected_failure", nil)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"message": "pet lookup unavailable"})
		return
	}
	petID := strings.TrimPrefix(r.URL.Path, "/pets/")
	for _, pet := range pets {
		if pet.ID == petID {
			writeJSON(w, http.StatusOK, pet)
			return
		}
	}
	writeJSON(w, http.StatusNotFound, map[string]string{"message": "pet not found"})
}

func graphQLHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"message": "method not allowed"})
		return
	}

	var body graphQLRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "invalid GraphQL request"})
		return
	}

	if !strings.Contains(strings.ToLower(body.Query), "pets") {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"errors": []map[string]string{{"message": "Only the pets query is available"}},
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{"pets": pets},
	})
}

func main() {
	shutdown, err := initTelemetry(context.Background())
	if err != nil {
		panic(err)
	}
	defer shutdown(context.Background())
	port := os.Getenv("PORT")
	if port == "" {
		port = "4200"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", observe("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "pets-service"})
	}))
	mux.HandleFunc("/pets", observe("/pets", petsHandler))
	mux.HandleFunc("/pets/", observe("/pets/:id", petByIDHandler))
	mux.HandleFunc("/graphql", observe("/graphql", graphQLHandler))

	jsonLog(context.Background(), "info", "listening", map[string]any{"port": port})
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		jsonLog(context.Background(), "error", "server_failed", map[string]any{"error": err.Error()})
		os.Exit(1)
	}
}
