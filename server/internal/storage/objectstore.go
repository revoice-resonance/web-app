// Package storage provides object storage abstraction for the Resonance server.
//
// It defines an ObjectStore interface that can be backed by MinIO (production)
// or an in-memory map (testing), allowing the service layer to depend on the
// interface instead of a concrete implementation.
package storage

import "context"

// ObjectStore is the storage abstraction used by the service layer.
// It captures the 6 methods that MinioStorage already implements.
type ObjectStore interface {
	PutObject(ctx context.Context, key string, data []byte, contentType string, metadata map[string]string) error
	GetObject(ctx context.Context, key string) ([]byte, error)
	DeleteObject(ctx context.Context, key string) error
	ObjectExists(ctx context.Context, key string) (bool, error)
	BuildURL(key string) string
	HealthCheck(ctx context.Context) bool
}