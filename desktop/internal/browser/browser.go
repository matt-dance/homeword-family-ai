package browser

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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
	return exec.Command(openProgram(runtime.GOOS), rawURL)
}

func openProgram(goos string) string {
	if goos == "linux" {
		return "xdg-open"
	}
	return "open"
}

// DecideLaunchOpen reports whether this invocation should open the parent
// URL and write .browser_opened.
//
// holder is the flock owner (the only process that starts children).
// webOK is a successful HTTP 200 from http://127.0.0.1:43123/.
// --open always opens. First-run on the holder opens only after webOK.
// A non-holder may open on first-run without marking unless webOK.
func DecideLaunchOpen(openFlag, firstRun, webOK, holder bool) (open, mark bool) {
	if !openFlag && !firstRun {
		return false, false
	}
	mark = webOK
	if openFlag || !holder {
		return true, mark
	}
	return webOK, mark
}
