package paths

import (
	"os"
	"path/filepath"
	"strings"
)

func AppSupportDirFromHome(home string) string {
	return home + "/Library/Application Support/Homeward"
}

func AppSupportDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return AppSupportDirFromHome(home), nil
}

func ResourceRoot(exePath string) string {
	if strings.HasSuffix(exePath, "Contents/MacOS/Homeward") {
		return strings.TrimSuffix(exePath, "MacOS/Homeward") + "Resources"
	}
	return filepath.Join(filepath.Dir(exePath), "resources")
}

func PoliciesDir(resourceRoot string) string {
	return resourceRoot + "/policies"
}

func WebDir(resourceRoot string) string {
	return resourceRoot + "/web"
}

func RuntimeDir(resourceRoot string) string {
	return resourceRoot + "/runtime"
}
