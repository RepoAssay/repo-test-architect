package checkout

import (
	"context"
	"net/http"
)

type PaymentClient struct {
	client *http.Client
}

func (client PaymentClient) Authorize(ctx context.Context, endpoint string) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, nil)
	if err != nil {
		return err
	}
	response, err := client.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	return nil
}
