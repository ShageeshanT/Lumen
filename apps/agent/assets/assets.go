// Package assets embeds static files the agent installs on a server.
package assets

import _ "embed"

// NotFoundPage is the calm 404 page Caddy serves for unknown hosts and paths.
//
//go:embed 404.html
var NotFoundPage string
