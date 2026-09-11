package winrun

import (
	"os/exec"
	"strings"
)

const ValueName = "Homeward"

const KeyPath = `Software\Microsoft\Windows\CurrentVersion\Run`

func CommandLine(execPath string) string {
	if strings.HasPrefix(execPath, `"`) {
		return execPath
	}
	return `"` + execPath + `"`
}

func WriteArgs(execPath string) []string {
	return []string{
		"reg", "add", `HKCU\` + KeyPath,
		"/v", ValueName, "/t", "REG_SZ", "/d", CommandLine(execPath), "/f",
	}
}

func RemoveArgs() []string {
	return []string{
		"reg", "delete", `HKCU\` + KeyPath,
		"/v", ValueName, "/f",
	}
}

func Write(execPath string) error {
	args := WriteArgs(execPath)
	return exec.Command(args[0], args[1:]...).Run()
}

func Remove() error {
	args := RemoveArgs()
	_ = exec.Command(args[0], args[1:]...).Run()
	return nil
}
