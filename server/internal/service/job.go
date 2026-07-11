package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/minc-nice-100/project-resonance/server/internal/storage"
	"github.com/minc-nice-100/project-resonance/server/internal/types"
)

// ErrStorageNotConfigured 表示 MinIO 未初始化（未配置或初始化失败）。
// 调用方应将其映射为 HTTP 503，而非 nil 解引用 panic。
var ErrStorageNotConfigured = errors.New("storage not configured: MinIO not initialized")

// Idempotency record for caching responses
type IdempotencyRecord struct {
	Key       string
	Response  []byte
	StatusCode int
	CreatedAt time.Time
}

// JobService manages all job operations with idempotency support
type JobService struct {
	storage     storage.ObjectStore
	idempotency map[string]*IdempotencyRecord
	idempMu     sync.RWMutex
	mu          sync.RWMutex

	// Job stores
	asrJobs  map[string]*types.ASRJob
	ttsJobs  map[string]*types.TTSJob
	corpusJobs map[string]*types.CorpusData
	logs      []types.LogEntry
}

// NewJobService creates a new job service
func NewJobService(storage storage.ObjectStore) *JobService {
	return &JobService{
		storage:     storage,
		idempotency: make(map[string]*IdempotencyRecord),
		asrJobs:     make(map[string]*types.ASRJob),
		ttsJobs:     make(map[string]*types.TTSJob),
		corpusJobs: make(map[string]*types.CorpusData),
		logs:       make([]types.LogEntry, 0),
	}
}

// CheckIdempotency checks if a request with this idempotency key was already processed
func (s *JobService) CheckIdempotency(key string) (bool, *IdempotencyRecord) {
	s.idempMu.RLock()
	defer s.idempMu.RUnlock()
	if rec, ok := s.idempotency[key]; ok {
		// Check if record is still valid (24 hours)
		if time.Since(rec.CreatedAt) < 24*time.Hour {
			return true, rec
		}
	}
	return false, nil
}

// StoreIdempotency stores the response for an idempotency key
func (s *JobService) StoreIdempotency(key string, response []byte, statusCode int) {
	s.idempMu.Lock()
	defer s.idempMu.Unlock()
	s.idempotency[key] = &IdempotencyRecord{
		Key:        key,
		Response:   response,
		StatusCode: statusCode,
		CreatedAt:  time.Now(),
	}
}

// GenerateJobID generates a unique job ID
func (s *JobService) GenerateJobID(prefix string) string {
	return fmt.Sprintf("%s_%s", prefix, uuid.New().String()[:8])
}

// SubmitASRJob submits an ASR transcription job
func (s *JobService) SubmitASRJob(ctx context.Context, req *types.ASRJobSubmitRequest) (*types.ASRJob, error) {
	job := &types.ASRJob{
		JobID:     s.GenerateJobID("asr"),
		AudioKey:  req.AudioKey,
		Status:    types.JobStatusPending,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	s.mu.Lock()
	s.asrJobs[job.JobID] = job
	s.mu.Unlock()

	// Log the job submission
	s.AppendLog(types.LogLevelInfo, "ASR job submitted", map[string]interface{}{
		"jobId":    job.JobID,
		"audioKey": job.AudioKey,
		"prefer":   req.Prefer,
	})

	// In a real implementation, this would trigger async processing
	// For now, we just store the job and return pending status

	return job, nil
}

// GetASRJob gets an ASR job by ID
func (s *JobService) GetASRJob(ctx context.Context, jobID string) (*types.ASRJob, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if job, ok := s.asrJobs[jobID]; ok {
		return job, nil
	}
	return nil, fmt.Errorf("job not found: %s", jobID)
}

// SubmitTTSJob submits a TTS synthesis job
func (s *JobService) SubmitTTSJob(ctx context.Context, req *types.TTSJobSubmitRequest) (*types.TTSJob, error) {
	job := &types.TTSJob{
		JobID: s.GenerateJobID("tts"),
		Request: types.TTSRequest{
			Text:  req.Text,
			Voice: req.Voice,
			Speed: req.Speed,
			Pitch: req.Pitch,
		},
		Status:    types.JobStatusPending,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	s.mu.Lock()
	s.ttsJobs[job.JobID] = job
	s.mu.Unlock()

	s.AppendLog(types.LogLevelInfo, "TTS job submitted", map[string]interface{}{
		"jobId": job.JobID,
		"text":  req.Text,
		"voice": req.Voice,
	})

	return job, nil
}

// GetTTSJob gets a TTS job by ID
func (s *JobService) GetTTSJob(ctx context.Context, jobID string) (*types.TTSJob, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if job, ok := s.ttsJobs[jobID]; ok {
		return job, nil
	}
	return nil, fmt.Errorf("job not found: %s", jobID)
}

// SubmitVoiceCloneJob submits a voice clone job
func (s *JobService) SubmitVoiceCloneJob(ctx context.Context, audioKey string, text string) (*types.TTSJob, error) {
	job := &types.TTSJob{
		JobID: s.GenerateJobID("clone"),
		Request: types.TTSRequest{
			Text: text,
		},
		Status:    types.JobStatusPending,
		AudioKey:  audioKey,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	s.mu.Lock()
	s.ttsJobs[job.JobID] = job
	s.mu.Unlock()

	s.AppendLog(types.LogLevelInfo, "Voice clone job submitted", map[string]interface{}{
		"jobId":    job.JobID,
		"audioKey": audioKey,
		"textLen":  len(text),
	})

	return job, nil
}

// UploadCorpus uploads corpus data
func (s *JobService) UploadCorpus(ctx context.Context, data *types.CorpusUploadRequest, audio []byte) (string, error) {
	corpusID := s.GenerateJobID("corpus")

	// Store audio file
	if len(audio) > 0 {
		if s.storage == nil {
			return "", ErrStorageNotConfigured
		}
		audioKey := fmt.Sprintf("corpus/audio/%s.wav", corpusID)
		if err := s.storage.PutObject(ctx, audioKey, audio, "audio/wav", map[string]string{
			"corpusId":   corpusID,
			"transcript": data.Transcript,
		}); err != nil {
			return "", fmt.Errorf("failed to store audio: %w", err)
		}
	}

	// Store metadata
	if s.storage == nil {
		return "", ErrStorageNotConfigured
	}
	metadataKey := fmt.Sprintf("corpus/meta/%s.json", corpusID)
	meta := map[string]interface{}{
		"corpusId":   corpusID,
		"transcript": data.Transcript,
		"speakerId":  data.SpeakerID,
		"metadata":   data.Metadata,
		"uploadedAt": time.Now().Format(time.RFC3339),
	}
	metaBytes, _ := json.Marshal(meta)
	if err := s.storage.PutObject(ctx, metadataKey, metaBytes, "application/json", nil); err != nil {
		return "", fmt.Errorf("failed to store metadata: %w", err)
	}

	s.mu.Lock()
	s.corpusJobs[corpusID] = &types.CorpusData{
		Audio:      audio,
		Transcript: data.Transcript,
		SpeakerID:  data.SpeakerID,
		Metadata:   data.Metadata,
	}
	s.mu.Unlock()

	s.AppendLog(types.LogLevelInfo, "Corpus uploaded", map[string]interface{}{
		"corpusId": corpusID,
		"textLen":  len(data.Transcript),
	})

	return corpusID, nil
}

// QueryCorpus queries corpus data
func (s *JobService) QueryCorpus(ctx context.Context, query *types.CorpusQuery) ([]*types.CorpusData, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var results []*types.CorpusData
	for _, c := range s.corpusJobs {
		// Apply filters (simplified - in production would query from storage)
		if query.SpeakerID != "" && c.SpeakerID != query.SpeakerID {
			continue
		}
		results = append(results, c)
	}

	// Apply pagination
	if query.Offset > 0 && query.Offset < len(results) {
		results = results[query.Offset:]
	}
	if query.Limit > 0 && query.Limit < len(results) {
		results = results[:query.Limit]
	}

	return results, nil
}

// AppendLog appends a log entry
func (s *JobService) AppendLog(level types.LogLevel, message string, metadata map[string]interface{}) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.logs = append(s.logs, types.LogEntry{
		Timestamp: time.Now().Format(time.RFC3339),
		Level:     level,
		Message:   message,
		Metadata:  metadata,
	})
}

// GetRecentLogs gets recent logs
func (s *JobService) GetRecentLogs(limit int) []types.LogEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if limit > len(s.logs) {
		limit = len(s.logs)
	}
	return s.logs[len(s.logs)-limit:]
}

// SaveClientLogs saves client-side logs
func (s *JobService) SaveClientLogs(logs []types.LogEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.logs = append(s.logs, logs...)
	return nil
}

// QueryLogs queries logs with filters
func (s *JobService) QueryLogs(startTime, endTime string, level types.LogLevel, limit int) ([]types.LogEntry, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var results []types.LogEntry
	for _, log := range s.logs {
		if level != "" && log.Level != level {
			continue
		}
		results = append(results, log)
	}

	// Apply limit
	if limit > 0 && limit < len(results) {
		results = results[len(results)-limit:]
	}

	return results, nil
}

// HealthCheck returns health status
func (s *JobService) HealthCheck(ctx context.Context) map[string]interface{} {
	return map[string]interface{}{
		"status":  "ok",
		"asrJobs": len(s.asrJobs),
		"ttsJobs": len(s.ttsJobs),
		"corpus":  len(s.corpusJobs),
		"logs":    len(s.logs),
	}
}

// StoreAudio stores audio data in MinIO
func (s *JobService) StoreAudio(ctx context.Context, key string, data []byte) error {
	if s.storage == nil {
		return ErrStorageNotConfigured
	}
	return s.storage.PutObject(ctx, key, data, "audio/wav", nil)
}

// BuildAudioURL builds a URL for an audio object
func (s *JobService) BuildAudioURL(key string) string {
	if s.storage == nil {
		return ""
	}
	return s.storage.BuildURL(key)
}

// GetCorpusStats returns corpus statistics
func (s *JobService) GetCorpusStats(ctx context.Context) (*types.CorpusStats, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var totalSize int64
	speakers := make(map[string]bool)
	var lastUpload string

	for _, c := range s.corpusJobs {
		totalSize += int64(len(c.Audio))
		if c.SpeakerID != "" {
			speakers[c.SpeakerID] = true
		}
	}

	return &types.CorpusStats{
		TotalCorpus:    len(s.corpusJobs),
		TotalAudioSize: totalSize,
		UniqueSpeakers: len(speakers),
		LastUpload:     lastUpload,
	}, nil
}

// GetLogsStats returns log statistics
func (s *JobService) GetLogsStats() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	stats := map[string]interface{}{
		"total": len(s.logs),
		"byLevel": map[string]int{
			"info":  0,
			"warn":  0,
			"error": 0,
		},
		"recentErrors": 0,
	}

	now := time.Now()
	for _, log := range s.logs {
		switch log.Level {
		case types.LogLevelInfo:
			stats["byLevel"].(map[string]int)["info"]++
		case types.LogLevelWarn:
			stats["byLevel"].(map[string]int)["warn"]++
		case types.LogLevelError:
			stats["byLevel"].(map[string]int)["error"]++
			// Count errors in last hour
			if t, err := time.Parse(time.RFC3339, log.Timestamp); err == nil && now.Sub(t) < time.Hour {
				stats["recentErrors"] = stats["recentErrors"].(int) + 1
			}
		}
	}

	return stats
}
