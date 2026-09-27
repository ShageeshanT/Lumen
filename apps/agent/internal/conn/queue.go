package conn

import (
	"sync"

	agentv1 "github.com/ShageeshanT/Lumen/packages/protocol/gen/go/lumen/agent/v1"
)

// QueueLimit bounds the agent → control plane queue (PHASE-02 §5).
const QueueLimit = 1000

// Class says what may be dropped when the queue is full.
type Class int

const (
	// Droppable messages (MetricsBatch) are resampled, so they go first.
	Droppable Class = iota
	// Normal messages (heartbeats) are dropped only when nothing droppable is left.
	Normal
	// Critical messages (Ack, OpError, results) are never dropped.
	Critical
)

type item struct {
	body  *agentv1.Envelope
	class Class
}

// Queue is a bounded FIFO with drop-by-class when full.
type Queue struct {
	mu      sync.Mutex
	items   []item
	notify  chan struct{}
	dropped uint64
}

// NewQueue returns an empty queue.
func NewQueue() *Queue { return &Queue{notify: make(chan struct{}, 1)} }

// Push appends body. When the queue is full it drops the oldest droppable
// message, then the oldest normal one; a critical message is always
// accepted, even over the limit. It reports whether body was queued.
func (q *Queue) Push(body *agentv1.Envelope, class Class) bool {
	q.mu.Lock()
	defer q.mu.Unlock()
	if len(q.items) >= QueueLimit {
		if !q.dropOldest(Droppable) {
			if class == Droppable {
				q.dropped++
				return false
			}
			if !q.dropOldest(Normal) && class != Critical {
				q.dropped++
				return false
			}
		}
	}
	q.items = append(q.items, item{body: body, class: class})
	select {
	case q.notify <- struct{}{}:
	default:
	}
	return true
}

func (q *Queue) dropOldest(c Class) bool {
	for i, it := range q.items {
		if it.class == c {
			q.items = append(q.items[:i], q.items[i+1:]...)
			q.dropped++
			return true
		}
	}
	return false
}

// Pop removes the oldest message, or returns nil when empty.
func (q *Queue) Pop() *agentv1.Envelope {
	q.mu.Lock()
	defer q.mu.Unlock()
	if len(q.items) == 0 {
		return nil
	}
	it := q.items[0]
	q.items[0] = item{}
	q.items = q.items[1:]
	return it.body
}

// Ready is signaled after a Push.
func (q *Queue) Ready() <-chan struct{} { return q.notify }

// Len is the number of queued messages.
func (q *Queue) Len() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.items)
}

// DropDroppable discards queued droppable messages (on disconnect, stale
// metrics are worthless).
func (q *Queue) DropDroppable() {
	q.mu.Lock()
	defer q.mu.Unlock()
	kept := q.items[:0]
	for _, it := range q.items {
		if it.class != Droppable {
			kept = append(kept, it)
		}
	}
	q.items = kept
}

// Dropped is the number of messages dropped so far.
func (q *Queue) Dropped() uint64 {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.dropped
}
