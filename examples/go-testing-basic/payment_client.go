package checkout

import (
	"context"
	"net/http"
)

type PaymentClient struct {
	client *http.Client
}

func NewPaymentClient(client *http.Client) (paymentClient *PaymentClient, err error) {
	return &PaymentClient{client: client}, nil
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
