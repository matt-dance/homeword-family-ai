package adopt

import (
	"io"
	"net"
	"net/http"
	"net/url"
	"time"
)

type Decision struct {
	StartOllama bool
	Reason      string
}

func Decide(occupied bool, isOllama bool) Decision {
	if !occupied {
		return Decision{StartOllama: true}
	}
	if isOllama {
		return Decision{StartOllama: false, Reason: "adopt"}
	}
	return Decision{StartOllama: false, Reason: "blocked"}
}

func Probe(rawURL string, timeout time.Duration) (occupied bool, isOllama bool) {
	if !tcpOccupied(rawURL, timeout) {
		return false, false
	}

	client := &http.Client{Timeout: timeout}
	resp, err := client.Get(rawURL)
	if err != nil {
		return true, false
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode == http.StatusOK {
		return true, true
	}
	return true, false
}

func tcpOccupied(rawURL string, timeout time.Duration) bool {
	u, err := url.Parse(rawURL)
	if err != nil || u.Host == "" {
		return false
	}
	host := u.Host
	if u.Port() == "" {
		port := "80"
		if u.Scheme == "https" {
			port = "443"
		}
		host = net.JoinHostPort(u.Hostname(), port)
	}
	d := net.Dialer{Timeout: timeout}
	conn, err := d.Dial("tcp", host)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}
