package launchd

import (
	"fmt"
	"os"
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
