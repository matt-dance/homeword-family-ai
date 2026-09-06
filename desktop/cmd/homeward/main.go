package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/energye/systray"

	"homeward/desktop/internal/adopt"
	"homeward/desktop/internal/browser"
	"homeward/desktop/internal/children"
	"homeward/desktop/internal/env"
	"homeward/desktop/internal/health"
	"homeward/desktop/internal/launchd"
	"homeward/desktop/internal/paths"
	"homeward/desktop/internal/proc"
)

const parentURL = "http://127.0.0.1:43123"

var trayIcon = []byte{
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
	0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00, 0x16,
	0x08, 0x06, 0x00, 0x00, 0x00, 0xc4, 0xb4, 0x6c, 0x3b, 0x00, 0x00, 0x00,
	0x21, 0x49, 0x44, 0x41, 0x54, 0x78, 0xda, 0x63, 0x90, 0xb3, 0x8a, 0xff,
	0x4f, 0x0b, 0xcc, 0x30, 0x6a, 0xf0, 0xa8, 0xc1, 0xa3, 0x06, 0x8f, 0x1a,
	0x3c, 0x6a, 0xf0, 0xa8, 0xc1, 0xa3, 0x06, 0x53, 0x86, 0x01, 0xef, 0xc2,
	0x3c, 0x46, 0xe9, 0x17, 0x04, 0xf4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
	0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
}

func main() {
	openFlag := flag.Bool("open", false, "open Homeward in the browser")
	uninstallFlag := flag.Bool("uninstall", false, "remove the login item")
	wipeFlag := flag.Bool("wipe-data", false, "delete Application Support data (requires --uninstall)")
	flag.Parse()
	if err := run(*openFlag, *uninstallFlag, *wipeFlag); err != nil {
		log.Fatal(err)
	}
}

func run(openFlag, uninstallFlag, wipeFlag bool) error {
	if wipeFlag && !uninstallFlag {
		return fmt.Errorf("--wipe-data requires --uninstall")
	}

	exe, err := os.Executable()
	if err != nil {
		return err
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	dataDir := paths.AppSupportDirFromHome(home)
	resourceRoot := paths.ResourceRoot(exe)
	childEnv := env.ChildEnv(dataDir, paths.PoliciesDir(resourceRoot), resourceRoot)
	marker := dataDir + "/.browser_opened"

	if uninstallFlag {
		_ = launchd.Bootout()
		_ = os.Remove(launchd.PlistPath(home))
		if wipeFlag {
			return os.RemoveAll(dataDir)
		}
		log.Printf("Homeward data remains at %s", dataDir)
		return nil
	}

	plist, err := launchd.WritePlist(home, exe)
	if err != nil {
		log.Printf("write LaunchAgent plist: %v", err)
	} else if err := launchd.Bootstrap(plist); err != nil {
		log.Printf("launchctl bootstrap: %v", err)
	}

	if err := os.MkdirAll(filepath.Join(dataDir, "ollama"), 0o755); err != nil {
		return err
	}

	specs, err := children.Specs(resourceRoot, dataDir, childEnv)
	if err != nil {
		return err
	}

	occupied, isOllama := adopt.Probe("http://127.0.0.1:11434/api/tags", 300*time.Millisecond)
	decision := adopt.Decide(occupied, isOllama)

	status := "Starting…"
	if decision.Reason == "blocked" {
		log.Print("port 11434 in use by non-Ollama")
		status = "Port 11434 is in use"
	}

	manager := proc.New()
	if err := manager.Start(specs, decision.StartOllama); err != nil {
		log.Printf("start children: %v", err)
		if status != "Port 11434 is in use" {
			status = err.Error()
		}
	}

	go func() {
		ch := make(chan os.Signal, 1)
		signal.Notify(ch, syscall.SIGTERM, syscall.SIGINT)
		<-ch
		_ = manager.Stop()
		os.Exit(0)
	}()

	if err := waitHealthy(decision.Reason != "blocked"); err != nil {
		log.Printf("health: %v", err)
		if status != "Port 11434 is in use" {
			status = err.Error()
		}
	} else if status != "Port 11434 is in use" {
		status = "Running"
	}

	if openFlag || browser.ShouldOpenOnBoot(marker) {
		if err := browser.OpenURL(parentURL).Start(); err != nil {
			log.Printf("open browser: %v", err)
		}
		if err := browser.MarkOpened(marker); err != nil {
			log.Printf("mark opened: %v", err)
		}
	}

	runTray(manager, status)
	return nil
}

func waitHealthy(waitOllama bool) error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	check := health.HTTPChecker{}
	if waitOllama {
		if err := health.Wait(ctx, check, "http://127.0.0.1:11434/api/tags"); err != nil {
			return err
		}
	}
	if err := health.Wait(ctx, check, "http://127.0.0.1:8000/api/v1/health"); err != nil {
		return err
	}
	return health.Wait(ctx, check, "http://127.0.0.1:43123/")
}

func runTray(manager *proc.Manager, status string) {
	systray.Run(func() {
		systray.SetIcon(trayIcon)
		systray.SetTitle("Homeward")
		systray.SetTooltip("Homeward")
		systray.CreateMenu()

		openItem := systray.AddMenuItem("Open Homeward", "Open Homeward")
		statusItem := systray.AddMenuItem("Status", "Status")
		statusItem.Disable()
		if status != "" {
			statusItem.SetTitle(status)
		}
		quitItem := systray.AddMenuItem("Quit Homeward", "Quit Homeward")

		openItem.Click(func() {
			_ = browser.OpenURL(parentURL).Start()
		})
		quitItem.Click(func() {
			_ = manager.Stop()
			os.Exit(0)
		})
	}, func() {
		_ = manager.Stop()
	})
}
