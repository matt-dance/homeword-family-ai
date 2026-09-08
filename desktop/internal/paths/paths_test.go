package paths

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestAppSupportDirFromHome(t *testing.T) {
	got := AppSupportDirFromHome("/Users/sam")
	want := "/Users/sam/Library/Application Support/Homeward"
	if runtime.GOOS == "linux" {
		got = AppSupportDirFromHome("/home/sam")
		want = "/home/sam/.local/share/homeward"
	}
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestAppSupportDirFromHomeGOOS(t *testing.T) {
	cases := []struct {
		goos string
		home string
		want string
	}{
		{goos: "darwin", home: "/Users/sam", want: "/Users/sam/Library/Application Support/Homeward"},
		{goos: "linux", home: "/home/sam", want: "/home/sam/.local/share/homeward"},
	}
	for _, tc := range cases {
		t.Run(tc.goos, func(t *testing.T) {
			got := appSupportDirFromHome(tc.home, tc.goos)
			if got != tc.want {
				t.Fatalf("got %q want %q", got, tc.want)
			}
		})
	}
}

func TestResourceRootFromAppBundle(t *testing.T) {
	exe := "/Applications/Homeward.app/Contents/MacOS/Homeward"
	got := ResourceRoot(exe)
	want := "/Applications/Homeward.app/Contents/Resources"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestResourceRootFromDevTree(t *testing.T) {
	exe := "/tmp/homeward-dev/Homeward"
	got := ResourceRoot(exe)
	want := filepath.Join("/tmp/homeward-dev", "resources")
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestResourceRootFromLinuxAppTree(t *testing.T) {
	exe := "/home/sam/.local/share/homeward/app/homeward"
	got := ResourceRoot(exe)
	want := filepath.Join("/home/sam/.local/share/homeward/app", "resources")
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestResourceRootFromLinuxShim(t *testing.T) {
	root := t.TempDir()
	appDir := filepath.Join(root, "app")
	if err := os.Mkdir(appDir, 0o755); err != nil {
		t.Fatal(err)
	}
	realExe := filepath.Join(appDir, "homeward")
	if err := os.WriteFile(realExe, []byte("exe"), 0o755); err != nil {
		t.Fatal(err)
	}
	shim := filepath.Join(root, "bin", "homeward")
	if err := os.Mkdir(filepath.Dir(shim), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(realExe, shim); err != nil {
		t.Fatal(err)
	}

	got := ResourceRoot(shim)
	want := filepath.Join(appDir, "resources")
	if resolved, err := filepath.EvalSymlinks(appDir); err == nil {
		want = filepath.Join(resolved, "resources")
	}
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}
