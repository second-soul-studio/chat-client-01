package main

import (
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

var allowedUpstreams []string
var allowedOrigins []string

var httpClient = &http.Client{
	// Do not follow redirects — pass them back to the caller.
	CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	},
	Transport: &http.Transport{
		DialContext: (&net.Dialer{
			Timeout: 10 * time.Second,
		}).DialContext,
		// Allow headers to arrive within 10s, but impose no body timeout
		// so that long-running SSE streams are not cut off.
		ResponseHeaderTimeout: 10 * time.Second,
	},
}

func isAllowed(value string, list []string) bool {
	value = strings.TrimSpace(value)
	for _, item := range list {
		if strings.TrimSpace(item) == value {
			return true
		}
	}
	return false
}

func setCORSHeaders(w http.ResponseWriter, origin string) {
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Target-URL")
	w.Header().Set("Access-Control-Max-Age", "86400")
}

func handleProxy(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")

	// ── Origin check ──────────────────────────────────────────────────────────
	// Only enforced when ALLOWED_ORIGINS is configured.
	if len(allowedOrigins) > 0 && origin != "" {
		if !isAllowed(origin, allowedOrigins) {
			http.Error(w, "origin not allowed", http.StatusForbidden)
			return
		}
	}

	// ── CORS preflight ────────────────────────────────────────────────────────
	if r.Method == http.MethodOptions {
		if origin != "" {
			setCORSHeaders(w, origin)
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// ── Target URL ────────────────────────────────────────────────────────────
	targetBase := strings.TrimRight(r.Header.Get("X-Target-URL"), "/")
	if targetBase == "" {
		http.Error(w, "X-Target-URL header is required", http.StatusBadRequest)
		return
	}
	if !isAllowed(targetBase, allowedUpstreams) {
		http.Error(w, "upstream URL not in whitelist", http.StatusForbidden)
		return
	}

	targetURL := targetBase + r.URL.RequestURI()

	// ── Build outgoing request ────────────────────────────────────────────────
	outReq, err := http.NewRequestWithContext(r.Context(), r.Method, targetURL, r.Body)
	if err != nil {
		http.Error(w, "failed to build upstream request", http.StatusBadRequest)
		return
	}

	for key, values := range r.Header {
		lower := strings.ToLower(key)
		if lower == "x-target-url" || lower == "host" {
			continue
		}
		for _, v := range values {
			outReq.Header.Add(key, v)
		}
	}

	// ── Forward ───────────────────────────────────────────────────────────────
	resp, err := httpClient.Do(outReq)
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// Copy upstream response headers, then overlay CORS headers.
	for key, values := range resp.Header {
		for _, v := range values {
			w.Header().Add(key, v)
		}
	}
	if origin != "" {
		setCORSHeaders(w, origin)
	}

	w.WriteHeader(resp.StatusCode)

	// ── Stream body ───────────────────────────────────────────────────────────
	flusher, canFlush := w.(http.Flusher)
	buf := make([]byte, 4096)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := w.Write(buf[:n]); writeErr != nil {
				return // client disconnected
			}
			if canFlush {
				flusher.Flush()
			}
		}
		if readErr != nil {
			return
		}
	}
}

func main() {
	upstreams := os.Getenv("ALLOWED_UPSTREAM_URLS")
	if upstreams == "" {
		log.Fatal("ALLOWED_UPSTREAM_URLS must be set (comma-separated list of allowed upstream base URLs)")
	}
	allowedUpstreams = strings.Split(upstreams, ",")

	if origins := os.Getenv("ALLOWED_ORIGINS"); origins != "" {
		allowedOrigins = strings.Split(origins, ",")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("proxy listening on :%s", port)
	log.Printf("allowed upstreams: %v", allowedUpstreams)
	if len(allowedOrigins) > 0 {
		log.Printf("allowed origins: %v", allowedOrigins)
	} else {
		log.Printf("origin check disabled — set ALLOWED_ORIGINS to enable")
	}

	http.HandleFunc("/", handleProxy)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}
