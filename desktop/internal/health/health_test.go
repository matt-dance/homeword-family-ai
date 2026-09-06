package health

import (
	"context"
	"errors"
	"testing"
	"time"
)

type stub struct {
	n    int
	code int
}

func (s *stub) Get(url string) (int, error) {
	s.n++
	if s.n < 3 {
		return 0, errors.New("down")
	}
	return s.code, nil
}

type down struct{}

func (down) Get(string) (int, error) { return 0, errors.New("down") }

func TestWaitSucceedsAfterRetries(t *testing.T) {
	s := &stub{code: 200}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := Wait(ctx, s, "http://127.0.0.1:43123/"); err != nil {
		t.Fatal(err)
	}
	if s.n < 3 {
		t.Fatalf("retries %d", s.n)
	}
}

func TestWaitFailsOnDeadline(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if err := Wait(ctx, down{}, "http://127.0.0.1:8000/api/v1/health"); err == nil {
		t.Fatal("expected error")
	}
}
