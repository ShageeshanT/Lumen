module github.com/ShageeshanT/Lumen/apps/agent

go 1.26.0

require (
	github.com/ShageeshanT/Lumen/packages/protocol v0.0.0
	github.com/coder/websocket v1.8.15
	golang.org/x/crypto v0.57.0
)

require (
	golang.org/x/sys v0.48.0 // indirect
	google.golang.org/protobuf v1.36.12 // indirect
)

// The protocol module lives in this repository; always build against it.
replace github.com/ShageeshanT/Lumen/packages/protocol => ../../packages/protocol
