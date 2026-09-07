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

func TestDecideLaunchOpen(t *testing.T) {
	cases := []struct {
		name     string
		openFlag bool
		firstRun bool
		webOK    bool
		holder   bool
		wantOpen bool
		wantMark bool
	}{
		{name: "holder first-run after health", firstRun: true, webOK: true, holder: true, wantOpen: true, wantMark: true},
		{name: "holder first-run health failed", firstRun: true, holder: true},
		{name: "holder --open after health", openFlag: true, webOK: true, holder: true, wantOpen: true, wantMark: true},
		{name: "holder --open health failed", openFlag: true, holder: true, wantOpen: true},
		{name: "holder later login", holder: true},
		{name: "non-holder first-run web down", firstRun: true, wantOpen: true},
		{name: "non-holder first-run web up", firstRun: true, webOK: true, wantOpen: true, wantMark: true},
		{name: "non-holder --open web down", openFlag: true, wantOpen: true},
		{name: "non-holder later login"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			open, mark := DecideLaunchOpen(tc.openFlag, tc.firstRun, tc.webOK, tc.holder)
			if open != tc.wantOpen || mark != tc.wantMark {
				t.Fatalf("open=%v mark=%v", open, mark)
			}
		})
	}
}
