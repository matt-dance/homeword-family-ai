package autostart

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDesktopPath(t *testing.T) {
	got := DesktopPath("/home/sam")
	want := "/home/sam/.config/autostart/homeward.desktop"
	if got != want {
		t.Fatalf("got %q", got)
	}
}

func TestDesktopEntry(t *testing.T) {
	entry := string(DesktopEntry("/home/sam/.local/share/homeward/app/homeward", ""))
	for _, needle := range []string{
		"[Desktop Entry]",
		"Type=Application",
		"Name=Homeward",
		"Exec=/home/sam/.local/share/homeward/app/homeward",
		"Terminal=false",
		"X-GNOME-Autostart-enabled=true",
	} {
		if !strings.Contains(entry, needle) {
			t.Fatalf("missing %s in %s", needle, entry)
		}
	}
	if strings.Contains(entry, "Icon=") {
		t.Fatalf("empty icon should omit Icon: %s", entry)
	}
}

func TestDesktopEntryIncludesIcon(t *testing.T) {
	icon := "/home/sam/.local/share/homeward/app/resources/icon.png"
	entry := string(DesktopEntry("/home/sam/.local/share/homeward/app/homeward", icon))
	if !strings.Contains(entry, "Icon="+icon) {
		t.Fatalf("missing Icon in %s", entry)
	}
}

func TestWrite(t *testing.T) {
	home := t.TempDir()
	exe := filepath.Join(home, ".local", "share", "homeward", "app", "homeward")
	path, err := Write(home, exe)
	if err != nil {
		t.Fatal(err)
	}
	if path != DesktopPath(home) {
		t.Fatalf("path %s", path)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	body := string(data)
	if !strings.Contains(body, "Name=Homeward") {
		t.Fatalf("wrote %s", data)
	}
	if !strings.Contains(body, "Exec="+exe) {
		t.Fatalf("wrote %s", data)
	}
	if filepath.Base(path) != "homeward.desktop" {
		t.Fatal(path)
	}
}

func TestWriteIncludesIconWhenPresent(t *testing.T) {
	home := t.TempDir()
	appDir := filepath.Join(home, ".local", "share", "homeward", "app")
	resDir := filepath.Join(appDir, "resources")
	if err := os.MkdirAll(resDir, 0o755); err != nil {
		t.Fatal(err)
	}
	icon := filepath.Join(resDir, "icon.png")
	if err := os.WriteFile(icon, []byte("png"), 0o644); err != nil {
		t.Fatal(err)
	}
	exe := filepath.Join(appDir, "homeward")
	path, err := Write(home, exe)
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "Icon="+icon) {
		t.Fatalf("wrote %s", data)
	}
}

func TestRemove(t *testing.T) {
	home := t.TempDir()
	exe := filepath.Join(home, "app", "homeward")
	path, err := Write(home, exe)
	if err != nil {
		t.Fatal(err)
	}
	if err := Remove(home); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("desktop file still present: %v", err)
	}
}

func TestRemoveMissing(t *testing.T) {
	if err := Remove(t.TempDir()); err != nil {
		t.Fatal(err)
	}
}
