package quitreq

import (
	"os"
	"time"
)

func Path(dataDir string) string {
	return dataDir + "/quit.request"
}

func Request(dataDir string) error {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(Path(dataDir), []byte("quit\n"), 0o644)
}

func Pending(dataDir string) bool {
	_, err := os.Stat(Path(dataDir))
	return err == nil
}

func Clear(dataDir string) {
	_ = os.Remove(Path(dataDir))
}

func WaitCleared(dataDir string, d time.Duration) bool {
	deadline := time.Now().Add(d)
	for time.Now().Before(deadline) {
		if !Pending(dataDir) {
			return true
		}
		time.Sleep(100 * time.Millisecond)
	}
	return !Pending(dataDir)
}
