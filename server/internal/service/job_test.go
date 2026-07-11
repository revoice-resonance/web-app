package service

import (
	"context"
	"testing"

	"github.com/minc-nice-100/project-resonance/server/internal/storage"
	"github.com/minc-nice-100/project-resonance/server/internal/types"
)

// newTestJobService creates a JobService backed by an in-memory ObjectStore.
func newTestJobService() *JobService {
	return NewJobService(storage.NewMemoryStorage())
}

func TestSubmitAndGetASRJob(t *testing.T) {
	svc := newTestJobService()
	ctx := context.Background()

	req := &types.ASRJobSubmitRequest{
		AudioKey: "audio/test.wav",
		Language: "en",
	}

	job, err := svc.SubmitASRJob(ctx, req)
	if err != nil {
		t.Fatalf("SubmitASRJob failed: %v", err)
	}
	if job.JobID == "" {
		t.Fatal("expected non-empty JobID")
	}
	if job.Status != types.JobStatusPending {
		t.Fatalf("expected status pending, got %s", job.Status)
	}
	if job.AudioKey != req.AudioKey {
		t.Fatalf("expected AudioKey %q, got %q", req.AudioKey, job.AudioKey)
	}

	// Retrieve the same job
	got, err := svc.GetASRJob(ctx, job.JobID)
	if err != nil {
		t.Fatalf("GetASRJob failed: %v", err)
	}
	if got.JobID != job.JobID {
		t.Fatalf("expected JobID %q, got %q", job.JobID, got.JobID)
	}
}

func TestGetASRJobNotFound(t *testing.T) {
	svc := newTestJobService()
	ctx := context.Background()

	_, err := svc.GetASRJob(ctx, "nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent job, got nil")
	}
}

func TestSubmitAndGetTTSJob(t *testing.T) {
	svc := newTestJobService()
	ctx := context.Background()

	req := &types.TTSJobSubmitRequest{
		Text:  "Hello world",
		Voice: "en-US-1",
		Speed: 1.0,
	}

	job, err := svc.SubmitTTSJob(ctx, req)
	if err != nil {
		t.Fatalf("SubmitTTSJob failed: %v", err)
	}
	if job.JobID == "" {
		t.Fatal("expected non-empty JobID")
	}
	if job.Status != types.JobStatusPending {
		t.Fatalf("expected status pending, got %s", job.Status)
	}
	if job.Request.Text != req.Text {
		t.Fatalf("expected Text %q, got %q", req.Text, job.Request.Text)
	}

	got, err := svc.GetTTSJob(ctx, job.JobID)
	if err != nil {
		t.Fatalf("GetTTSJob failed: %v", err)
	}
	if got.JobID != job.JobID {
		t.Fatalf("expected JobID %q, got %q", job.JobID, got.JobID)
	}
}

func TestUploadCorpus(t *testing.T) {
	svc := newTestJobService()
	ctx := context.Background()

	req := &types.CorpusUploadRequest{
		Transcript: "The quick brown fox",
		SpeakerID:  "speaker-1",
		Metadata:   map[string]interface{}{"source": "test"},
	}
	audio := []byte("fake-audio-data")

	corpusID, err := svc.UploadCorpus(ctx, req, audio)
	if err != nil {
		t.Fatalf("UploadCorpus failed: %v", err)
	}
	if corpusID == "" {
		t.Fatal("expected non-empty corpusID")
	}

	// Verify the audio was stored via the ObjectStore interface
	audioKey := "corpus/audio/" + corpusID + ".wav"
	exists, err := svc.storage.ObjectExists(ctx, audioKey)
	if err != nil {
		t.Fatalf("ObjectExists failed: %v", err)
	}
	if !exists {
		t.Fatal("expected audio object to exist in storage")
	}

	// Verify audio content
	data, err := svc.storage.GetObject(ctx, audioKey)
	if err != nil {
		t.Fatalf("GetObject failed: %v", err)
	}
	if string(data) != string(audio) {
		t.Fatalf("expected audio %q, got %q", string(audio), string(data))
	}
}

func TestIdempotency(t *testing.T) {
	svc := newTestJobService()

	key := "idempotent-key-123"
	response := []byte(`{"ok":true}`)
	statusCode := 200

	// Should not be found initially
	found, _ := svc.CheckIdempotency(key)
	if found {
		t.Fatal("expected idempotency key not found initially")
	}

	// Store and retrieve
	svc.StoreIdempotency(key, response, statusCode)
	found, rec := svc.CheckIdempotency(key)
	if !found {
		t.Fatal("expected idempotency key to be found after storing")
	}
	if rec.StatusCode != statusCode {
		t.Fatalf("expected statusCode %d, got %d", statusCode, rec.StatusCode)
	}
	if string(rec.Response) != string(response) {
		t.Fatalf("expected response %q, got %q", string(response), string(rec.Response))
	}
}

func TestHealthCheck(t *testing.T) {
	svc := newTestJobService()
	ctx := context.Background()

	// Submit a few jobs to populate stats
	svc.SubmitASRJob(ctx, &types.ASRJobSubmitRequest{AudioKey: "a.wav"})
	svc.SubmitTTSJob(ctx, &types.TTSJobSubmitRequest{Text: "hello"})

	health := svc.HealthCheck(ctx)
	if health["status"] != "ok" {
		t.Fatalf("expected status ok, got %v", health["status"])
	}
	if health["asrJobs"].(int) != 1 {
		t.Fatalf("expected 1 asrJob, got %v", health["asrJobs"])
	}
	if health["ttsJobs"].(int) != 1 {
		t.Fatalf("expected 1 ttsJob, got %v", health["ttsJobs"])
	}
}

func TestStoreAudio(t *testing.T) {
	svc := newTestJobService()
	ctx := context.Background()

	key := "audio/test-store.wav"
	data := []byte("pcm-data")

	if err := svc.StoreAudio(ctx, key, data); err != nil {
		t.Fatalf("StoreAudio failed: %v", err)
	}

	// Verify stored content
	got, err := svc.storage.GetObject(ctx, key)
	if err != nil {
		t.Fatalf("GetObject failed: %v", err)
	}
	if string(got) != string(data) {
		t.Fatalf("expected %q, got %q", string(data), string(got))
	}
}

func TestBuildAudioURL(t *testing.T) {
	svc := newTestJobService()

	url := svc.BuildAudioURL("audio/test.wav")
	if url == "" {
		t.Fatal("expected non-empty URL")
	}
	// MemoryStorage returns "memory://<key>"
	if url != "memory://audio/test.wav" {
		t.Fatalf("expected memory://audio/test.wav, got %q", url)
	}
}

func TestErrStorageNotConfigured(t *testing.T) {
	// Create a JobService with nil storage
	svc := NewJobService(nil)
	ctx := context.Background()

	err := svc.StoreAudio(ctx, "key", []byte("data"))
	if err != ErrStorageNotConfigured {
		t.Fatalf("expected ErrStorageNotConfigured, got %v", err)
	}
}