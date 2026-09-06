package proc

import (
	"testing"
	"time"

	"homeward/desktop/internal/children"
)

func TestStartSkipsOllamaWhenAdopted(t *testing.T) {
	m := New()
	specs := []children.Spec{
		{Name: "ollama", Path: "/bin/sleep", Args: []string{"30"}},
		{Name: "gateway", Path: "/bin/sleep", Args: []string{"30"}},
	}
	if err := m.Start(specs, false); err != nil {
		t.Fatal(err)
	}
	defer m.Stop()
	time.Sleep(50 * time.Millisecond)
	if m.Running("ollama") {
		t.Fatal("adopted Ollama must not be started")
	}
	if !m.Running("gateway") {
		t.Fatal("gateway should run")
	}
}

func TestStopEndsChildren(t *testing.T) {
	m := New()
	specs := []children.Spec{{Name: "web", Path: "/bin/sleep", Args: []string{"30"}}}
	if err := m.Start(specs, true); err != nil {
		t.Fatal(err)
	}
	if err := m.Stop(); err != nil {
		t.Fatal(err)
	}
	if m.Running("web") {
		t.Fatal("web still running")
	}
}
