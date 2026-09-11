//go:build !windows

package proc

import "os/exec"

func applySysProcAttr(cmd *exec.Cmd) {}
