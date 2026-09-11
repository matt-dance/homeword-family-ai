//go:build windows

package singleton

import (
	"os"

	"golang.org/x/sys/windows"
)

// TryAcquire opens path and takes a non-blocking exclusive file lock.
// ok is false when another process already holds the lock.
func TryAcquire(path string) (lock *Lock, ok bool, err error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		return nil, false, err
	}
	var ov windows.Overlapped
	err = windows.LockFileEx(
		windows.Handle(f.Fd()),
		windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY,
		0,
		1,
		0,
		&ov,
	)
	if err != nil {
		_ = f.Close()
		if err == windows.ERROR_LOCK_VIOLATION || err == windows.ERROR_IO_PENDING {
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
	var ov windows.Overlapped
	_ = windows.UnlockFileEx(windows.Handle(l.f.Fd()), 0, 1, 0, &ov)
	err := l.f.Close()
	l.f = nil
	return err
}
