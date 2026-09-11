package paths

import (
	"path/filepath"
	"runtime"
	"strings"
)

func AppSupportDirFromHome(home string) string {
	return appSupportDirFromHome(home, runtime.GOOS)
}

func appSupportDirFromHome(home, goos string) string {
	if goos == "linux" {
		return home + "/.local/share/homeward"
	}
	return home + "/Library/Application Support/Homeward"
}

func ResourceRoot(exePath string) string {
	if resolved, err := filepath.EvalSymlinks(exePath); err == nil {
		exePath = resolved
	}
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
