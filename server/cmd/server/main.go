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
		ready.Store(true) // Ready even without MinIO
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
		if ready.Load() {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"ready"}`))
		} else {
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte(`{"status":"not ready"}`))
		}
	})

	// Add CORS middleware
	corsMux := corsMiddleware(mux)

	// Create server
	srv := &http.Server{
		Addr:         *addr,
		Handler:      corsMux,
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

// corsMiddleware adds CORS headers
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Idempotency-Key, X-Client-Info")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
