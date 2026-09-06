package launchd

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

const Label = "ai.homeward.app"

func PlistPath(home string) string {
	return home + "/Library/LaunchAgents/ai.homeward.app.plist"
}

func PlistXML(execPath string) []byte {
	return []byte(fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>%s</string>
  <key>ProgramArguments</key>
  <array>
    <string>%s</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
</dict>
</plist>
`, Label, execPath))
}

func WritePlist(home, execPath string) (string, error) {
	path := PlistPath(home)
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(path, PlistXML(execPath), 0o644); err != nil {
		return "", err
	}
	return path, nil
}

func guiDomain() string {
	return fmt.Sprintf("gui/%d", os.Getuid())
}

func serviceTarget() string {
	return guiDomain() + "/" + Label
}

func Bootstrap(plist string) error {
	return exec.Command("launchctl", "bootstrap", guiDomain(), plist).Run()
}

func Bootout() error {
	return exec.Command("launchctl", "bootout", serviceTarget()).Run()
}

// KillArgs is the launchctl argv that SIGTERMs the login-item supervisor.
// The agent's signal handler then Stop()s children (not adopted Ollama).
func KillArgs() []string {
	return []string{"launchctl", "kill", "SIGTERM", serviceTarget()}
}

func Kill() error {
	args := KillArgs()
	return exec.Command(args[0], args[1:]...).Run()
}
