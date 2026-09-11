package children

import (
	"testing"
)

func TestSpecsOrderAndBins(t *testing.T) {
	root := "/app/Contents/Resources"
	specs, err := Specs(root, []string{"HOMEWARD_MANAGED=true"})
	if err != nil {
		t.Fatal(err)
	}
	if len(specs) != 3 {
		t.Fatalf("len %d", len(specs))
	}
	if specs[0].Name != "ollama" || specs[0].Path != root+"/runtime/ollama/ollama" {
		t.Fatalf("ollama %+v", specs[0])
	}
	if specs[1].Name != "gateway" || specs[1].Path != root+"/runtime/python/bin/python" {
		t.Fatalf("gateway %+v", specs[1])
	}
	if len(specs[1].Args) < 2 || specs[1].Args[0] != "-m" || specs[1].Args[1] != "uvicorn" {
		t.Fatalf("gateway args %+v", specs[1].Args)
	}
	if specs[2].Name != "web" || specs[2].Args[0] != root+"/web/server.js" {
		t.Fatalf("web %+v", specs[2])
	}
}
