// Package opid generates operation ids (UUIDv7, RFC 9562) and remembers
// recently seen ones so a re-delivered request is handled once.
package opid

import (
	"container/list"
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"sync"
	"time"
)

// New returns a UUIDv7 string: 48-bit Unix milliseconds, version 7, random rest.
func New() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	var ts [8]byte
	binary.BigEndian.PutUint64(ts[:], uint64(time.Now().UnixMilli())) //nolint:gosec // positive timestamp
	copy(b[0:6], ts[2:8])                                             // low 48 bits
	b[6] = (b[6] & 0x0f) | 0x70
	b[8] = (b[8] & 0x3f) | 0x80
	h := hex.EncodeToString(b[:])
	return h[0:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:32]
}

// Seen is a bounded LRU set of op ids (10,000 on the agent, PHASE-02 §5).
type Seen struct {
	mu    sync.Mutex
	limit int
	order *list.List
	index map[string]*list.Element
}

// NewSeen returns an empty set holding at most limit ids.
func NewSeen(limit int) *Seen {
	return &Seen{limit: limit, order: list.New(), index: map[string]*list.Element{}}
}

// Add records id and reports whether it was new.
func (s *Seen) Add(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if e, ok := s.index[id]; ok {
		s.order.MoveToFront(e)
		return false
	}
	s.index[id] = s.order.PushFront(id)
	for s.order.Len() > s.limit {
		last := s.order.Back()
		s.order.Remove(last)
		delete(s.index, last.Value.(string)) //nolint:forcetypeassert // only strings are stored
	}
	return true
}

// Len is the number of remembered ids.
func (s *Seen) Len() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.order.Len()
}
