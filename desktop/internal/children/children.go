package children

import (
	"errors"
	"path/filepath"
	"runtime"

	"homeward/desktop/internal/paths"
)

type Spec struct {
	Name string
	Path string
	Args []string
	Env  []string
}

func Specs(resourceRoot, dataDir string, childEnv []string) ([]Spec, error) {
	return specsFor(runtime.GOOS, resourceRoot, dataDir, childEnv)
}

func specsFor(goos, resourceRoot, dataDir string, childEnv []string) ([]Spec, error) {
	if resourceRoot == "" {
		return nil, errors.New("empty resourceRoot")
	}

	runtimeDir := paths.RuntimeDir(resourceRoot)
	webDir := paths.WebDir(resourceRoot)

	ollamaPath := filepath.Join(runtimeDir, "ollama", "ollama")
	pythonPath := filepath.Join(runtimeDir, "python", "bin", "python")
	nodePath := filepath.Join(runtimeDir, "node", "bin", "node")
	if goos == "windows" {
		ollamaPath = filepath.Join(runtimeDir, "ollama", "ollama.exe")
		pythonPath = filepath.Join(runtimeDir, "python", "python.exe")
		nodePath = filepath.Join(runtimeDir, "node", "node.exe")
	}

	return []Spec{
		{
			Name: "ollama",
			Path: ollamaPath,
			Args: []string{"serve"},
			Env:  childEnv,
		},
		{
			Name: "gateway",
			Path: pythonPath,
			Args: []string{"-m", "uvicorn", "homeward_gateway.main:app", "--host", "127.0.0.1", "--port", "8000"},
			Env:  childEnv,
		},
		{
			Name: "web",
			Path: nodePath,
			Args: []string{filepath.Join(webDir, "server.js")},
			Env:  childEnv,
		},
	}, nil
}
