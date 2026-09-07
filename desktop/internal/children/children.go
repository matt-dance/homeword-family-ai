package children

import (
	"errors"

	"homeward/desktop/internal/paths"
)

type Spec struct {
	Name string
	Path string
	Args []string
	Env  []string
}

func Specs(resourceRoot, dataDir string, childEnv []string) ([]Spec, error) {
	if resourceRoot == "" {
		return nil, errors.New("empty resourceRoot")
	}
	_ = dataDir

	runtimeDir := paths.RuntimeDir(resourceRoot)
	webDir := paths.WebDir(resourceRoot)

	return []Spec{
		{
			Name: "ollama",
			Path: runtimeDir + "/ollama/ollama",
			Args: []string{"serve"},
			Env:  childEnv,
		},
		{
			Name: "gateway",
			Path: runtimeDir + "/python/bin/python",
			Args: []string{"-m", "uvicorn", "homeward_gateway.main:app", "--host", "127.0.0.1", "--port", "8000"},
			Env:  childEnv,
		},
		{
			Name: "web",
			Path: runtimeDir + "/node/bin/node",
			Args: []string{webDir + "/server.js"},
			Env:  childEnv,
		},
	}, nil
}
