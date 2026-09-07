package singleton

import (
	"os"
	"syscall"
)

// Path is the exclusive supervisor lock inside Application Support.
func Path(dataDir string) string {
	return dataDir + "/supervisor.lock"
}

// Lock is a held exclusive flock. The file stays open until Release or process exit.
type Lock struct {
	f *os.File
}

// TryAcquire opens path and takes a non-blocking exclusive flock.
// ok is false when another process already holds the lock.
func TryAcquire(path string) (lock *Lock, ok bool, err error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		return nil, false, err
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		_ = f.Close()
		if err == syscall.EWOULDBLOCK || err == syscall.EAGAIN {
			return nil, false, nil
		}
		return nil, false, err
	}
	return &Lock{f: f}, true, nil
}

func (l *Lock) Release() error {
	if l == nil || l.f == nil {
		return nil
	}
	_ = syscall.Flock(int(l.f.Fd()), syscall.LOCK_UN)
	err := l.f.Close()
	l.f = nil
	return err
}
