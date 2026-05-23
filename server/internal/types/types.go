package types

import "time"

// API Response wrapper
type Response struct {
	OK      bool        `json:"ok"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
	Message string      `json:"message,omitempty"`
}

// Job statuses
type JobStatus string

const (
	JobStatusPending    JobStatus = "pending"
	JobStatusProcessing JobStatus = "processing"
	JobStatusCompleted  JobStatus = "completed"
	JobStatusFailed     JobStatus = "failed"
)

// ASR Job
type ASRJob struct {
	JobID      string    `json:"jobId"`
	AudioKey   string    `json:"audioKey"`
	Status     JobStatus `json:"status"`
	ResultKey  string    `json:"resultKey,omitempty"`
	Error      string    `json:"error,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// ASR Request/Response types
type ASRJobSubmitRequest struct {
	AudioKey  string `json:"audioKey"`
	Language  string `json:"language,omitempty"`
	Prefer    string `json:"prefer,omitempty"` // whisper, gemini, browser
}

type ASRJobStatusRequest struct {
	JobID string `json:"jobId"`
}

// Transcription Result
type TranscriptionResult struct {
	Text       string  `json:"text"`
	Confidence float64 `json:"confidence"`
	Language   string  `json:"language"`
	Duration   float64 `json:"duration"`
	Source     string  `json:"source"` // whisper, gemini, browser
}

// TTS Job
type TTSJob struct {
	JobID     string     `json:"jobId"`
	Request   TTSRequest `json:"request"`
	Status    JobStatus  `json:"status"`
	AudioKey  string     `json:"audioKey,omitempty"`
	Error     string     `json:"error,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

type TTSRequest struct {
	Text  string   `json:"text"`
	Voice string   `json:"voice,omitempty"`
	Speed float64  `json:"speed,omitempty"`
	Pitch float64  `json:"pitch,omitempty"`
}

type TTSJobSubmitRequest struct {
	Text  string  `json:"text"`
	Voice string  `json:"voice,omitempty"`
	Speed float64 `json:"speed,omitempty"`
	Pitch float64 `json:"pitch,omitempty"`
}

type TTSJobStatusRequest struct {
	JobID string `json:"jobId"`
}

// Corpus types
type CorpusData struct {
	Audio      []byte                `json:"-"`
	Transcript string                `json:"transcript"`
	SpeakerID  string                `json:"speakerId,omitempty"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

type CorpusUploadRequest struct {
	Audio      []byte                `json:"-"`
	Transcript string                `json:"transcript"`
	SpeakerID  string                `json:"speakerId,omitempty"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

type CorpusQuery struct {
	CorpusID  string `json:"corpusId,omitempty"`
	SpeakerID string `json:"speakerId,omitempty"`
	StartTime string `json:"startTime,omitempty"`
	EndTime   string `json:"endTime,omitempty"`
	Limit     int    `json:"limit,omitempty"`
	Offset    int    `json:"offset,omitempty"`
}

type CorpusStats struct {
	TotalCorpus     int    `json:"totalCorpus"`
	TotalAudioSize  int64  `json:"totalAudioSize"`
	UniqueSpeakers  int    `json:"uniqueSpeakers"`
	LastUpload      string `json:"lastUpload,omitempty"`
}

// Log types
type LogLevel string

const (
	LogLevelInfo  LogLevel = "info"
	LogLevelWarn  LogLevel = "warn"
	LogLevelError LogLevel = "error"
)

type LogEntry struct {
	Timestamp string                 `json:"timestamp"`
	Level     LogLevel               `json:"level"`
	Message   string                 `json:"message"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

type LogsUploadRequest struct {
	Logs []LogEntry `json:"logs"`
}

type LogsQueryRequest struct {
	StartTime string   `json:"startTime,omitempty"`
	EndTime   string   `json:"endTime,omitempty"`
	Level     LogLevel `json:"level,omitempty"`
	Limit     int      `json:"limit,omitempty"`
}

// Health check
type HealthResponse struct {
	Status string `json:"status"`
}

type StatsResponse struct {
	Status string `json:"status"`
	Info   string `json:"info"`
}

// Audio upload response
type AudioUploadResponse struct {
	AudioKey string `json:"audioKey"`
	URL      string `json:"url"`
	Message  string `json:"message"`
}

// Idempotency key header
const IdempotencyKeyHeader = "X-Idempotency-Key"
