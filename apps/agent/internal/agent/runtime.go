package agent

import "runtime"

func goroutines() int { return runtime.NumGoroutine() }
