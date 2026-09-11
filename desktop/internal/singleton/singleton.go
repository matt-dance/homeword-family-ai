package singleton

import "os"

// Path is the exclusive supervisor lock inside Application Support.
func Path(dataDir string) string {
	return dataDir + "/supervisor.lock"
}

// Lock is a held exclusive lock. The file stays open until Release or process exit.
type Lock struct {
	f *os.File
}
