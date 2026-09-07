package adopt

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestDecide(t *testing.T) {
	if d := Decide(false, false); !d.StartOllama {
		t.Fatal("free port should start")
	}
	if d := Decide(true, true); d.StartOllama || d.Reason != "adopt" {
		t.Fatalf("adopt %+v", d)
	}
	if d := Decide(true, false); d.StartOllama || d.Reason != "blocked" {
		t.Fatalf("blocked %+v", d)
	}
}

func TestProbeHealthyOllama(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/tags" {
			t.Fatalf("path %s", r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"models":[]}`))
	}))
	defer srv.Close()
	occupied, isOllama := Probe(srv.URL+"/api/tags", time.Second)
	if !occupied || !isOllama {
		t.Fatalf("occupied=%v isOllama=%v", occupied, isOllama)
	}
}

func TestProbeRefused(t *testing.T) {
	occupied, isOllama := Probe("http://127.0.0.1:1/api/tags", 200*time.Millisecond)
	if occupied || isOllama {
		t.Fatalf("occupied=%v isOllama=%v", occupied, isOllama)
	}
}
