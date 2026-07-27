package checkout

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPaymentClientAuthorize(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(server.Close)

	client, err := NewPaymentClient(server.Client())
	if err != nil {
		t.Fatalf("NewPaymentClient returned an error: %v", err)
	}
	if err := client.Authorize(context.Background(), server.URL); err != nil {
		t.Fatalf("Authorize returned an error: %v", err)
	}
}
