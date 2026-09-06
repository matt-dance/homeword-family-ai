package paths

import (
	"path/filepath"
	"testing"
)

func TestAppSupportDirFromHome(t *testing.T) {
	got := AppSupportDirFromHome("/Users/sam")
	want := "/Users/sam/Library/Application Support/Homeward"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestResourceRootFromAppBundle(t *testing.T) {
	exe := "/Applications/Homeward.app/Contents/MacOS/Homeward"
	got := ResourceRoot(exe)
	want := "/Applications/Homeward.app/Contents/Resources"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestResourceRootFromDevTree(t *testing.T) {
	exe := "/tmp/homeward-dev/Homeward"
	got := ResourceRoot(exe)
	want := filepath.Join("/tmp/homeward-dev", "resources")
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}
