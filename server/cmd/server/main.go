package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/minc-nice-100/project-resonance/server/internal/api"
	"github.com/minc-nice-100/project-resonance/server/internal/service"
	"github.com/minc-nice-100/project-resonance/server/internal/storage"
)

// K8s health state
var ready atomic.Bool

func main() {
	ready.Store(false)

	// Parse flags
	addr := flag.String("addr", ":8080", "server address")
	minioEndpoint := flag.String("minio-endpoint", os.Getenv("MINIO_ENDPOINT"), "MinIO endpoint")
	minioAccessKey := flag.String("minio-access-key", os.Getenv("MINIO_ACCESS_KEY"), "MinIO access key")
	minioSecretKey := flag.String("minio-secret-key", os.Getenv("MINIO_SECRET_KEY"), "MinIO secret key")
	minioBucket := flag.String("minio-bucket", os.Getenv("MINIO_BUCKET_NAME"), "MinIO bucket name")
	minioRegion := flag.String("minio-region", "us-east-1", "MinIO region")
	minioUseSSL := flag.Bool("minio-ssl", false, "Use SSL for MinIO")
	allowedOrigin := flag.String("allowed-origin", os.Getenv("ALLOWED_ORIGIN"), "CORS allowed origin (empty = reflect request Origin)")
	apiKey := flag.String("api-key", os.Getenv("API_KEY"), "Shared secret for write endpoints (empty = no auth, dev only)")

	flag.Parse()

	// Initialize storage
	var store *storage.MinioStorage
	var err error

	if *minioEndpoint != "" && *minioAccessKey != "" && *minioSecretKey != "" && *minioBucket != "" {
		store, err = storage.NewMinioStorage(storage.Config{
			Endpoint:  *minioEndpoint,
			AccessKey: *minioAccessKey,
			SecretKey: *minioSecretKey,
			Bucket:    *minioBucket,
			Region:    *minioRegion,
			UseSSL:    *minioUseSSL,
		})
		if err != nil {
			log.Printf("Warning: Failed to initialize MinIO storage: %v", err)
		} else {
			// Ensure bucket exists
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			if err := store.EnsureBucket(ctx); err != nil {
				log.Printf("Warning: Failed to ensure bucket exists: %v", err)
			} else {
				ready.Store(true) // Mark as ready after successful init
			}
			cancel()
		}
	} else {
		log.Println("Warning: MinIO not configured, running in limited mode")
		// 不再标记 ready：未配置存储时，依赖存储的接口应返回 503，而不是 ready 后 nil panic
	}

	// Initialize services
	jobService := service.NewJobService(store)
	handler := api.NewHandler(jobService)

	// Setup router
	mux := http.NewServeMux()
	handler.SetupRoutes(mux)

	// K8s health endpoints for probes
	mux.HandleFunc("/health/live", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})
	mux.HandleFunc("/health/ready", func(w http.ResponseWriter, r *http.Request) {
		if !ready.Load() {
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte(`{"status":"not ready"}`))
			return
		}
		if store == nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte(`{"status":"storage not configured"}`))
			return
		}
		// 实时探测 MinIO，避免初始化后存储掉线仍被判定 ready
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		ok := store.HealthCheck(ctx)
		cancel()
		if !ok {
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte(`{"status":"storage unavailable"}`))
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ready"}`))
	})

	// CORS（外层）+ 鉴权（内层）：OPTIONS 预检在 CORS 层短路，不进入鉴权
	rootHandler := corsMiddleware(apiKeyAuth(mux, *apiKey), *allowedOrigin)

	// Create server
	srv := &http.Server{
		Addr:         *addr,
		Handler:      rootHandler,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Printf("Server starting on %s", *addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
	ready.Store(false)

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}

// resolveOrigin picks the Access-Control-Allow-Origin value.
// If allowedOrigin is set, use it (browsers reject non-matching cross-origin).
// Otherwise reflect the request Origin (better than a wildcard '*').
func resolveOrigin(allowedOrigin string, r *http.Request) string {
	if allowedOrigin != "" {
		return allowedOrigin
	}
	if o := r.Header.Get("Origin"); o != "" {
		return o
	}
	return "*"
}

// corsMiddleware (外层) 添加 CORS 头并短路 OPTIONS 预检，
// 使预检请求不会进入内层的 apiKeyAuth。
func corsMiddleware(next http.Handler, allowedOrigin string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := resolveOrigin(allowedOrigin, r)
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Idempotency-Key, X-Client-Info, X-API-Key")
		w.Header().Set("Vary", "Origin")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// apiKeyAuth (内层) 限制写操作（非 GET/OPTIONS）需要 X-API-Key。
// apiKey 为空时不鉴权（仅本地开发）；生产部署应设置 API_KEY，并由客户端发送 X-API-Key。
// 健康检查端点始终公开。
func apiKeyAuth(next http.Handler, apiKey string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if apiKey == "" {
			next.ServeHTTP(w, r)
			return
		}
		// GET / OPTIONS / 健康检查走公开
		if r.Method == http.MethodGet || r.Method == http.MethodOptions ||
			r.URL.Path == "/health/live" || r.URL.Path == "/health/ready" {
			next.ServeHTTP(w, r)
			return
		}
		if r.Header.Get("X-API-Key") != apiKey {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"ok":false,"error":"Unauthorized"}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}
