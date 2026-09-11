package paths

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

func AppSupportDirFromHome(home string) string {
	return appSupportDirFromHome(home, runtime.GOOS)
}

func appSupportDirFromHome(home, goos string) string {
	switch goos {
	case "linux":
		return home + "/.local/share/homeward"
	case "windows":
		return home + "/AppData/Local/Homeward"
	default:
		return home + "/Library/Application Support/Homeward"
	}
}

func AppSupportDir() (string, error) {
	if runtime.GOOS == "windows" {
		if local := os.Getenv("LOCALAPPDATA"); local != "" {
			return filepath.Join(local, "Homeward"), nil
		}
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return AppSupportDirFromHome(home), nil
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
