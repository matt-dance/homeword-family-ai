package health

import (
	"context"
	"io"
	"net/http"
	"time"
)

type Checker interface {
	Get(url string) (status int, err error)
}

type HTTPChecker struct{}

func (HTTPChecker) Get(rawURL string) (int, error) {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(rawURL)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	return resp.StatusCode, nil
}

func Wait(ctx context.Context, check Checker, url string) error {
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		status, err := check.Get(url)
		if err == nil && status == 200 {
			return nil
		}
		timer := time.NewTimer(100 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
}
