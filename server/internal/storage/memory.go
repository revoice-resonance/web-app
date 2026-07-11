package storage

import (
	"context"
	"fmt"
	"sync"
)

// memoryBlob holds a stored blob together with its metadata.
type memoryBlob struct {
	data        []byte
	contentType string
	metadata    map[string]string
}

// MemoryStorage is an in-memory ObjectStore implementation backed by a
// map[string]*memoryBlob. It is intended for unit tests and local development.
type MemoryStorage struct {
	mu    sync.RWMutex
	blobs map[string]*memoryBlob
}

// NewMemoryStorage creates a new empty MemoryStorage.
func NewMemoryStorage() *MemoryStorage {
	return &MemoryStorage{
		blobs: make(map[string]*memoryBlob),
	}
}

// PutObject stores a blob under the given key.
func (m *MemoryStorage) PutObject(ctx context.Context, key string, data []byte, contentType string, metadata map[string]string) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	m.blobs[key] = &memoryBlob{
		data:        data,
		contentType: contentType,
		metadata:    metadata,
	}
	return nil
}

// GetObject retrieves the blob stored under key. Returns an error if the key
// does not exist.
func (m *MemoryStorage) GetObject(ctx context.Context, key string) ([]byte, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	blob, ok := m.blobs[key]
	if !ok {
		return nil, fmt.Errorf("object not found: %s", key)
	}
	return blob.data, nil
}

// DeleteObject removes the blob stored under key.
func (m *MemoryStorage) DeleteObject(ctx context.Context, key string) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.blobs, key)
	return nil
}

// ObjectExists reports whether a blob exists under key.
func (m *MemoryStorage) ObjectExists(ctx context.Context, key string) (bool, error) {
	select {
	case <-ctx.Done():
		return false, ctx.Err()
	default:
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	_, ok := m.blobs[key]
	return ok, nil
}

// BuildURL returns a synthetic URL for the given key.
func (m *MemoryStorage) BuildURL(key string) string {
	return fmt.Sprintf("memory://%s", key)
}

// HealthCheck always returns true — an in-memory store has no remote
// dependency to probe.
func (m *MemoryStorage) HealthCheck(ctx context.Context) bool {
	return true
}