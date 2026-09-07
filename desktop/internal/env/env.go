package env

import (
	"os"
	"path/filepath"
	"strings"
)

func ChildEnv(dataDir, policiesDir, resourceRoot string) []string {
	ffmpegBin := filepath.Join(resourceRoot, "runtime", "ffmpeg", "bin")
	espeakBin := filepath.Join(resourceRoot, "runtime", "espeak", "bin")

	overrides := map[string]string{
		"HOMEWARD_HOST":              "127.0.0.1",
		"HOMEWARD_PORT":              "8000",
		"HOMEWARD_WEB_PORT":          "43123",
		"HOMEWARD_MANAGED":           "true",
		"HOMEWARD_DOCKER":            "false",
		"HOMEWARD_MDNS_ENABLED":      "true",
		"HOMEWARD_OLLAMA_BASE_URL":   "http://127.0.0.1:11434",
		"HOMEWARD_DATA_DIR":          dataDir,
		"HOMEWARD_POLICIES_DIR":      policiesDir,
		"GATEWAY_URL":                "http://127.0.0.1:8000",
		"PORT":                       "43123",
		"HOSTNAME":                   "0.0.0.0",
		"OLLAMA_HOST":                "127.0.0.1:11434",
		"OLLAMA_MODELS":              filepath.Join(dataDir, "ollama"),
		"PATH":                       buildPath(ffmpegBin, espeakBin),
	}

	env := os.Environ()
	result := make([]string, 0, len(env)+len(overrides))
	seen := make(map[string]struct{}, len(overrides))

	for _, item := range env {
		key, _, ok := strings.Cut(item, "=")
		if !ok {
			result = append(result, item)
			continue
		}
		if value, ok := overrides[key]; ok {
			result = append(result, key+"="+value)
			seen[key] = struct{}{}
			continue
		}
		result = append(result, item)
	}

	for key, value := range overrides {
		if _, ok := seen[key]; ok {
			continue
		}
		result = append(result, key+"="+value)
	}

	return result
}

func buildPath(ffmpegBin, espeakBin string) string {
	prefix := ffmpegBin + string(os.PathListSeparator) + espeakBin
	if existing := os.Getenv("PATH"); existing != "" {
		return prefix + string(os.PathListSeparator) + existing
	}
	return prefix
}
