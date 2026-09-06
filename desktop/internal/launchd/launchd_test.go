package launchd

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPlistPath(t *testing.T) {
	got := PlistPath("/Users/sam")
	want := "/Users/sam/Library/LaunchAgents/ai.homeward.app.plist"
	if got != want {
		t.Fatalf("got %q", got)
	}
}

func TestPlistXML(t *testing.T) {
	xml := string(PlistXML("/Applications/Homeward.app/Contents/MacOS/Homeward"))
	for _, needle := range []string{
		"<string>ai.homeward.app</string>",
		"<string>/Applications/Homeward.app/Contents/MacOS/Homeward</string>",
		"<key>RunAtLoad</key>",
		"<key>SuccessfulExit</key>",
	} {
		if !strings.Contains(xml, needle) {
			t.Fatalf("missing %s in %s", needle, xml)
		}
	}
	if !strings.Contains(xml, "<false/>") {
		t.Fatal("SuccessfulExit must be false")
	}
}

func TestWritePlist(t *testing.T) {
	home := t.TempDir()
	path, err := WritePlist(home, "/Applications/Homeward.app/Contents/MacOS/Homeward")
	if err != nil {
		t.Fatal(err)
	}
	if path != PlistPath(home) {
		t.Fatalf("path %s", path)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "ai.homeward.app") {
		t.Fatalf("wrote %s", data)
	}
	if filepath.Base(path) != "ai.homeward.app.plist" {
		t.Fatal(path)
	}
}
