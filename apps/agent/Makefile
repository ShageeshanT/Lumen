# Convenience targets; the build itself lives in scripts/build-go.sh so CI and
# local builds share one definition. Static binaries (CGO_ENABLED=0) for
# linux/amd64 and linux/arm64 land in bin/.

.PHONY: build test lint release-sign

build:
	GOARCH_LIST="amd64 arm64" bash ../../scripts/build-go.sh

test:
	go test ./...

lint:
	GOOS=linux golangci-lint run ./...

# Usage: make release-sign KEY=path/to/release.key
release-sign: build
	go run ./cmd/lumen-release sign -key $(KEY) bin/lumen-agent-linux-amd64 bin/lumen-agent-linux-arm64
