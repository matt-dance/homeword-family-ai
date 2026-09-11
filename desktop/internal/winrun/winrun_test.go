package winrun

import (
	"strings"
	"testing"
)

func TestCommandLineQuotes(t *testing.T) {
	got := CommandLine(`C:\Users\sam\AppData\Local\Programs\Homeward\Homeward.exe`)
	want := `"C:\Users\sam\AppData\Local\Programs\Homeward\Homeward.exe"`
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
	if CommandLine(want) != want {
		t.Fatal("already-quoted path should stay quoted")
	}
}

func TestWriteArgsHKCURun(t *testing.T) {
	exe := `C:\Users\sam\AppData\Local\Programs\Homeward\Homeward.exe`
	args := WriteArgs(exe)
	joined := strings.Join(args, " ")
	for _, needle := range []string{
		"reg",
		`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`,
		"Homeward",
		`"` + exe + `"`,
	} {
		if !strings.Contains(joined, needle) {
			t.Fatalf("missing %q in %v", needle, args)
		}
	}
	if args[0] != "reg" || args[1] != "add" {
		t.Fatalf("argv %v", args)
	}
}

func TestRemoveArgsHKCURun(t *testing.T) {
	args := RemoveArgs()
	joined := strings.Join(args, " ")
	if args[0] != "reg" || args[1] != "delete" {
		t.Fatalf("argv %v", args)
	}
	if !strings.Contains(joined, `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`) {
		t.Fatalf("missing key in %v", args)
	}
	if !strings.Contains(joined, ValueName) {
		t.Fatalf("missing value name in %v", args)
	}
}
