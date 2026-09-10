package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/energye/systray"

	"homeward/desktop/internal/adopt"
	"homeward/desktop/internal/autostart"
	"homeward/desktop/internal/browser"
	"homeward/desktop/internal/children"
	"homeward/desktop/internal/env"
	"homeward/desktop/internal/health"
	"homeward/desktop/internal/launchd"
	"homeward/desktop/internal/paths"
	"homeward/desktop/internal/proc"
	"homeward/desktop/internal/singleton"
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
	wipeFlag := flag.Bool("wipe-data", false, "delete family data (requires --uninstall)")
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
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
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
		return runUninstall(home, dataDir, wipeFlag)
	}

	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return err
	}
	lock, held, err := singleton.TryAcquire(singleton.Path(dataDir))
	if err != nil {
		return err
	}
	if !held {
		return runSecondary(openFlag, marker)
	}
	defer lock.Release()

	if err := ensureLoginItem(home, exe); err != nil {
		log.Printf("login item: %v", err)
	}

	if err := os.MkdirAll(filepath.Join(dataDir, "ollama"), 0o755); err != nil {
		return err
	}

	specs, err := children.Specs(resourceRoot, childEnv)
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

	webOK := false
	if err := waitHealthy(decision.Reason != "blocked"); err != nil {
		log.Printf("health: %v", err)
		if status != "Port 11434 is in use" {
			status = err.Error()
		}
		webOK = webHealthy()
	} else {
		webOK = true
		if status != "Port 11434 is in use" {
			status = "Running"
		}
	}

	maybeOpenBrowser(openFlag, browser.ShouldOpenOnBoot(marker), webOK, true, marker)
	runTray(manager, status)
	return nil
}

// runSecondary handles a second Homeward (login item after user launch, or
// opening the app while the tray is already up). It must not Start children.
func runSecondary(openFlag bool, marker string) error {
	maybeOpenBrowser(openFlag, browser.ShouldOpenOnBoot(marker), webHealthy(), false, marker)
	return nil
}

func webHealthy() bool {
	status, err := health.HTTPChecker{}.Get(parentURL + "/")
	return err == nil && status == 200
}

func maybeOpenBrowser(openFlag, firstRun, webOK, holder bool, marker string) {
	doOpen, doMark := browser.DecideLaunchOpen(openFlag, firstRun, webOK, holder)
	if doOpen {
		if err := browser.OpenURL(parentURL).Start(); err != nil {
			log.Printf("open browser: %v", err)
		}
	}
	if doMark {
		if err := browser.MarkOpened(marker); err != nil {
			log.Printf("mark opened: %v", err)
		}
	}
}

// runUninstall removes the login item. `--uninstall` always runs as a second
// process with no local Manager: on Darwin, launchd.Kill SIGTERMs the
// login-item supervisor; on Linux, other `homeward` processes are signaled.
// The supervisor's signal handler Stop()s gateway/web (and bundled ollama
// only). Adopted system Ollama is not signaled.
func runUninstall(home, dataDir string, wipe bool) error {
	removeLoginItem(home)
	if wipe {
		return os.RemoveAll(dataDir)
	}
	log.Printf("Homeward data remains at %s", dataDir)
	return nil
}

func ensureLoginItem(home, exe string) error {
	if runtime.GOOS == "linux" {
		_, err := autostart.Write(home, exe)
		return err
	}
	plist, err := launchd.WritePlist(home, exe)
	if err != nil {
		return fmt.Errorf("write LaunchAgent plist: %w", err)
	}
	if err := launchd.Bootstrap(plist); err != nil {
		return fmt.Errorf("launchctl bootstrap: %w", err)
	}
	return nil
}

func removeLoginItem(home string) {
	if runtime.GOOS == "linux" {
		_ = autostart.Remove(home)
		signalOtherSupervisors()
		time.Sleep(time.Second)
		return
	}
	_ = launchd.Kill()
	time.Sleep(time.Second)
	_ = launchd.Bootout()
	_ = os.Remove(launchd.PlistPath(home))
}

// signalOtherSupervisors SIGTERMs other `homeward` processes so a second-process
// `--uninstall` can stop the tray supervisor and its children.
func signalOtherSupervisors() {
	out, err := exec.Command("pgrep", "-x", "homeward").Output()
	if err != nil {
		return
	}
	self := os.Getpid()
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		pid, err := strconv.Atoi(line)
		if err != nil || pid == self {
			continue
		}
		p, err := os.FindProcess(pid)
		if err != nil {
			continue
		}
		_ = p.Signal(syscall.SIGTERM)
	}
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
