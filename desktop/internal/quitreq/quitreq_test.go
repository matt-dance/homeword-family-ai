package quitreq

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestRequestPendingClear(t *testing.T) {
	dir := t.TempDir()
	if Pending(dir) {
		t.Fatal("missing file should not be pending")
	}
	if err := Request(dir); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(dir, "quit.request"))
	if err != nil || string(data) != "quit\n" {
		t.Fatalf("wrote %q err=%v", data, err)
	}
	if !Pending(dir) {
		t.Fatal("expected pending")
	}
	Clear(dir)
	if Pending(dir) {
		t.Fatal("cleared file still pending")
	}
}

func TestWaitCleared(t *testing.T) {
	dir := t.TempDir()
	if err := Request(dir); err != nil {
		t.Fatal(err)
	}
	go func() {
		time.Sleep(50 * time.Millisecond)
		Clear(dir)
	}()
	if !WaitCleared(dir, time.Second) {
		t.Fatal("should clear")
	}
}
