package env

import (
	"strings"
	"testing"
)

func lookup(env []string, key string) string {
	prefix := key + "="
	for _, item := range env {
		if strings.HasPrefix(item, prefix) {
			return strings.TrimPrefix(item, prefix)
		}
	}
	return ""
}

func TestChildEnvNativeFlags(t *testing.T) {
	items := ChildEnv(
		"/Users/sam/Library/Application Support/Homeward",
		"/app/Contents/Resources/policies",
		"/app/Contents/Resources",
	)
	if lookup(items, "HOMEWARD_MANAGED") != "true" {
		t.Fatal("HOMEWARD_MANAGED")
	}
	if lookup(items, "HOMEWARD_DOCKER") != "false" {
		t.Fatal("HOMEWARD_DOCKER")
	}
	if lookup(items, "HOMEWARD_WEB_PORT") != "43123" {
		t.Fatal("HOMEWARD_WEB_PORT")
	}
	if lookup(items, "HOMEWARD_HOST") != "127.0.0.1" {
		t.Fatal("HOMEWARD_HOST")
	}
	if lookup(items, "OLLAMA_MODELS") != "/Users/sam/Library/Application Support/Homeward/ollama" {
		t.Fatal("OLLAMA_MODELS")
	}
	if lookup(items, "HOMEWARD_DOCKER") == "true" {
		t.Fatal("native env must not set HOMEWARD_DOCKER=true")
	}
	path := lookup(items, "PATH")
	if !strings.Contains(path, "/app/Contents/Resources/runtime/ffmpeg/bin") {
		t.Fatalf("PATH missing ffmpeg: %s", path)
	}
	if lookup(items, "ESPEAK_DATA_PATH") != "/app/Contents/Resources/runtime/espeak/share/espeak-ng-data" {
		t.Fatalf("ESPEAK_DATA_PATH=%q", lookup(items, "ESPEAK_DATA_PATH"))
	}
}
