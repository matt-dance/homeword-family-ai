package autostart

import (
	"os"
	"path/filepath"
	"strings"
)

func DesktopPath(home string) string {
	return home + "/.config/autostart/homeward.desktop"
}

func DesktopEntry(execPath, iconPath string) []byte {
	var b strings.Builder
	b.WriteString("[Desktop Entry]\n")
	b.WriteString("Type=Application\n")
	b.WriteString("Name=Homeward\n")
	b.WriteString("Exec=" + execPath + "\n")
	if iconPath != "" {
		b.WriteString("Icon=" + iconPath + "\n")
	}
	b.WriteString("X-GNOME-Autostart-enabled=true\n")
	b.WriteString("Terminal=false\n")
	return []byte(b.String())
}

func Write(home, execPath string) (string, error) {
	path := DesktopPath(home)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", err
	}
	abs, err := filepath.Abs(execPath)
	if err != nil {
		return "", err
	}
	if resolved, err := filepath.EvalSymlinks(abs); err == nil {
		abs = resolved
	}
	if err := os.WriteFile(path, DesktopEntry(abs, findIcon(abs)), 0o644); err != nil {
		return "", err
	}
	return path, nil
}

func Remove(home string) error {
	err := os.Remove(DesktopPath(home))
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func findIcon(execPath string) string {
	dir := filepath.Dir(execPath)
	for _, name := range []string{"icon.png", "icon.svg"} {
		candidate := filepath.Join(dir, "resources", name)
		info, err := os.Stat(candidate)
		if err == nil && !info.IsDir() {
			return candidate
		}
	}
	return ""
}
