package browser

import (
	"os"
	"path/filepath"
	"testing"
)

func TestShouldOpenOnBoot(t *testing.T) {
	dir := t.TempDir()
	marker := filepath.Join(dir, ".browser_opened")
	if !ShouldOpenOnBoot(marker) {
		t.Fatal("missing marker should open")
	}
	if err := MarkOpened(marker); err != nil {
		t.Fatal(err)
	}
	if ShouldOpenOnBoot(marker) {
		t.Fatal("marker should suppress open")
	}
	data, err := os.ReadFile(marker)
	if err != nil || string(data) != "opened\n" {
		t.Fatalf("marker %q", data)
	}
}

func TestOpenURLUsesOpen(t *testing.T) {
	cmd := OpenURL("http://127.0.0.1:43123")
	if cmd.Args[0] != "open" || cmd.Args[1] != "http://127.0.0.1:43123" {
		t.Fatalf("%v", cmd.Args)
	}
}
