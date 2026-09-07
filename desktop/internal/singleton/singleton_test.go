package singleton

import (
	"path/filepath"
	"testing"
)

func TestPath(t *testing.T) {
	got := Path("/tmp/Homeward")
	if got != "/tmp/Homeward/supervisor.lock" {
		t.Fatalf("got %q", got)
	}
}

func TestTryAcquireExclusive(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "supervisor.lock")

	first, ok, err := TryAcquire(path)
	if err != nil || !ok {
		t.Fatalf("first acquire: ok=%v err=%v", ok, err)
	}
	defer first.Release()

	second, ok, err := TryAcquire(path)
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		_ = second.Release()
		t.Fatal("second acquire must fail")
	}

	if err := first.Release(); err != nil {
		t.Fatal(err)
	}

	again, ok, err := TryAcquire(path)
	if err != nil || !ok {
		t.Fatalf("after release: ok=%v err=%v", ok, err)
	}
	if err := again.Release(); err != nil {
		t.Fatal(err)
	}
}
