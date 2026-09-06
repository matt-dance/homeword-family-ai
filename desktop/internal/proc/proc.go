package proc

import (
	"os/exec"
	"sync"
	"syscall"
	"time"

	"homeward/desktop/internal/children"
)

type Manager struct {
	mu      sync.Mutex
	stopped bool
	cmds    map[string]*exec.Cmd
	specs   map[string]children.Spec
	exited  map[string]chan struct{}
}

func New() *Manager {
	return &Manager{
		cmds:   make(map[string]*exec.Cmd),
		specs:  make(map[string]children.Spec),
		exited: make(map[string]chan struct{}),
	}
}

func (m *Manager) Start(specs []children.Spec, startOllama bool) error {
	m.mu.Lock()
	m.stopped = false
	m.mu.Unlock()
	for _, spec := range specs {
		if spec.Name == "ollama" && !startOllama {
			continue
		}
		if err := m.startSpec(spec); err != nil {
			return err
		}
	}
	return nil
}

func (m *Manager) startSpec(spec children.Spec) error {
	cmd := exec.Command(spec.Path, spec.Args...)
	if len(spec.Env) > 0 {
		cmd.Env = spec.Env
	}
	m.mu.Lock()
	if m.stopped {
		m.mu.Unlock()
		return nil
	}
	m.mu.Unlock()

	if err := cmd.Start(); err != nil {
		return err
	}
	done := make(chan struct{})

	m.mu.Lock()
	if m.stopped {
		m.mu.Unlock()
		if cmd.Process != nil {
			_ = cmd.Process.Signal(syscall.SIGTERM)
		}
		go func() {
			_ = cmd.Wait()
			close(done)
		}()
		return nil
	}
	m.cmds[spec.Name] = cmd
	m.specs[spec.Name] = spec
	m.exited[spec.Name] = done
	m.mu.Unlock()

	go func() {
		err := cmd.Wait()
		close(done)
		m.mu.Lock()
		stopped := m.stopped
		m.mu.Unlock()
		nonZero := err != nil || (cmd.ProcessState != nil && !cmd.ProcessState.Success())
		if !stopped && nonZero {
			_ = m.Restart(spec.Name)
		}
	}()
	return nil
}

func (m *Manager) Running(name string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	cmd, ok := m.cmds[name]
	if !ok || cmd == nil || cmd.Process == nil {
		return false
	}
	if cmd.ProcessState != nil {
		return false
	}
	return cmd.Process.Signal(syscall.Signal(0)) == nil
}

func (m *Manager) Restart(name string) error {
	m.mu.Lock()
	if m.stopped {
		m.mu.Unlock()
		return nil
	}
	spec, ok := m.specs[name]
	old := m.cmds[name]
	m.mu.Unlock()
	if !ok {
		return nil
	}
	if old != nil && old.Process != nil && old.ProcessState == nil {
		_ = old.Process.Signal(syscall.SIGTERM)
	}
	return m.startSpec(spec)
}

func (m *Manager) Stop() error {
	m.mu.Lock()
	m.stopped = true
	cmds := make([]*exec.Cmd, 0, len(m.cmds))
	dones := make([]chan struct{}, 0, len(m.exited))
	for _, cmd := range m.cmds {
		cmds = append(cmds, cmd)
	}
	for _, ch := range m.exited {
		dones = append(dones, ch)
	}
	m.mu.Unlock()

	for _, cmd := range cmds {
		if cmd != nil && cmd.Process != nil && cmd.ProcessState == nil {
			_ = cmd.Process.Signal(syscall.SIGTERM)
		}
	}

	finished := make(chan struct{})
	go func() {
		for _, ch := range dones {
			if ch != nil {
				<-ch
			}
		}
		close(finished)
	}()

	select {
	case <-finished:
	case <-time.After(3 * time.Second):
		for _, cmd := range cmds {
			if cmd != nil && cmd.Process != nil && cmd.ProcessState == nil {
				_ = cmd.Process.Kill()
			}
		}
		<-finished
	}
	return nil
}
