package opid

import (
	"regexp"
	"testing"
)

func TestNewIsUUIDv7(t *testing.T) {
	t.Parallel()
	re := regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	a, b := New(), New()
	if !re.MatchString(a) || a == b {
		t.Fatalf("%s %s", a, b)
	}
}

func TestSeenIsBoundedLRU(t *testing.T) {
	t.Parallel()
	s := NewSeen(2)
	if !s.Add("a") || !s.Add("b") || s.Add("a") {
		t.Fatal("basic add")
	}
	s.Add("c") // evicts b (a was refreshed)
	if s.Len() != 2 || !s.Add("b") {
		t.Fatal("b should have been evicted")
	}
	if s.Add("b") || s.Len() != 2 {
		t.Fatal("b is present now and the set stays bounded")
	}
}
