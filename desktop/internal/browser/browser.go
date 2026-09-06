package browser

import (
	"os"
	"os/exec"
	"path/filepath"
)

func ShouldOpenOnBoot(markerPath string) bool {
	_, err := os.Stat(markerPath)
	return err != nil
}

func MarkOpened(markerPath string) error {
	if err := os.MkdirAll(filepath.Dir(markerPath), 0o755); err != nil {
		return err
	}
	return os.WriteFile(markerPath, []byte("opened\n"), 0o644)
}

func OpenURL(rawURL string) *exec.Cmd {
	return exec.Command("open", rawURL)
}
