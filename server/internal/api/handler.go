package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"github.com/minc-nice-100/project-resonance/server/internal/service"
	"github.com/minc-nice-100/project-resonance/server/internal/types"
)

type Handler struct {
	jobService *service.JobService
}

func NewHandler(jobService *service.JobService) *Handler {
	return &Handler{
		jobService: jobService,
	}
}

// Response helpers
func JSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func Success(w http.ResponseWriter, data interface{}) {
	JSON(w, http.StatusOK, types.Response{
		OK:   true,
		Data: data,
	})
}

func Error(w http.ResponseWriter, status int, msg string) {
	JSON(w, status, types.Response{
		OK:    false,
		Error: msg,
	})
}

func withIdempotency(h func(w http.ResponseWriter, r *http.Request) (interface{}, int, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		idempKey := r.Header.Get(types.IdempotencyKeyHeader)

		// Check idempotency cache
		if idempKey != "" {
			if found, rec := handler.jobService.CheckIdempotency(idempKey); found {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("X-Idempotency-Replay", "true")
				w.WriteHeader(rec.StatusCode)
				w.Write(rec.Response)
				return
			}
		}

		data, status, err := h(w, r)
		if err != nil {
			Error(w, status, err.Error())
			return
		}

		// Store idempotency result
		if idempKey != "" {
			resp, _ := json.Marshal(types.Response{OK: true, Data: data})
			handler.jobService.StoreIdempotency(idempKey, resp, status)
		}

		Success(w, data)
	}
}

// Global handler reference for idempotency check
var handler *Handler

func init() {
	// Will be set in NewHandler
}

// Health check
func (h *Handler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		Error(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	Success(w, types.HealthResponse{Status: "ok"})
}

// Stats
func (h *Handler) Stats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		Error(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	Success(w, types.StatsResponse{Status: "ok", Info: "Resonance API is running"})
}

// Audio upload
func (h *Handler) UploadAudio(w http.ResponseWriter, r *http.Request) (interface{}, int, error) {
	if r.Method != http.MethodPost {
		return nil, http.StatusMethodNotAllowed, nil
	}

	if err := r.ParseMultipartForm(32 << 20); err != nil {
		return nil, http.StatusBadRequest, err
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	defer file.Close()

	audioData, err := io.ReadAll(file)
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}

	// Generate audio key
	audioKey := h.jobService.GenerateJobID("audio") + ".wav"
	objectKey := "audio/" + audioKey

	// Store in MinIO
	ctx := r.Context()
	if err := h.jobService.StoreAudio(ctx, objectKey, audioData); err != nil {
		return nil, http.StatusInternalServerError, err
	}

	return types.AudioUploadResponse{
		AudioKey: objectKey,
		URL:      h.jobService.BuildAudioURL(objectKey),
		Message:  "Audio uploaded successfully",
	}, http.StatusOK, nil
}

// ASR Job submission
func (h *Handler) SubmitASRJob(w http.ResponseWriter, r *http.Request) (interface{}, int, error) {
	if r.Method != http.MethodPost {
		return nil, http.StatusMethodNotAllowed, nil
	}

	var req types.ASRJobSubmitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return nil, http.StatusBadRequest, err
	}

	if req.AudioKey == "" {
		return nil, http.StatusBadRequest, nil
	}

	job, err := h.jobService.SubmitASRJob(r.Context(), &req)
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}

	return job, http.StatusOK, nil
}

// ASR Job status
func (h *Handler) GetASRJobStatus(w http.ResponseWriter, r *http.Request) (interface{}, int, error) {
	if r.Method != http.MethodGet {
		return nil, http.StatusMethodNotAllowed, nil
	}

	jobID := r.URL.Query().Get("jobId")
	if jobID == "" {
		return nil, http.StatusBadRequest, nil
	}

	job, err := h.jobService.GetASRJob(r.Context(), jobID)
	if err != nil {
		return nil, http.StatusNotFound, err
	}

	return job, http.StatusOK, nil
}

// TTS Job submission
func (h *Handler) SubmitTTSJob(w http.ResponseWriter, r *http.Request) (interface{}, int, error) {
	if r.Method != http.MethodPost {
		return nil, http.StatusMethodNotAllowed, nil
	}

	var req types.TTSJobSubmitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return nil, http.StatusBadRequest, err
	}

	if req.Text == "" {
		return nil, http.StatusBadRequest, nil
	}

	job, err := h.jobService.SubmitTTSJob(r.Context(), &req)
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}

	return job, http.StatusOK, nil
}

// TTS Job status
func (h *Handler) GetTTSJobStatus(w http.ResponseWriter, r *http.Request) (interface{}, int, error) {
	if r.Method != http.MethodGet {
		return nil, http.StatusMethodNotAllowed, nil
	}

	jobID := r.URL.Query().Get("jobId")
	if jobID == "" {
		return nil, http.StatusBadRequest, nil
	}

	job, err := h.jobService.GetTTSJob(r.Context(), jobID)
	if err != nil {
		return nil, http.StatusNotFound, err
	}

	return job, http.StatusOK, nil
}

// Voice clone job submission
func (h *Handler) SubmitVoiceCloneJob(w http.ResponseWriter, r *http.Request) (interface{}, int, error) {
	if r.Method != http.MethodPost {
		return nil, http.StatusMethodNotAllowed, nil
	}

	if err := r.ParseMultipartForm(32 << 20); err != nil {
		return nil, http.StatusBadRequest, err
	}

	file, _, err := r.FormFile("prompt_wav")
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	defer file.Close()

	text := r.FormValue("tts_text")
	if text == "" {
		return nil, http.StatusBadRequest, nil
	}

	audioData, err := io.ReadAll(file)
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}

	// Store reference audio
	audioKey := "tts/reference/" + h.jobService.GenerateJobID("ref") + ".wav"
	ctx := r.Context()
	if err := h.jobService.StoreAudio(ctx, audioKey, audioData); err != nil {
		return nil, http.StatusInternalServerError, err
	}

	job, err := h.jobService.SubmitVoiceCloneJob(ctx, audioKey, text)
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}

	return job, http.StatusOK, nil
}

// Corpus upload
func (h *Handler) UploadCorpus(w http.ResponseWriter, r *http.Request) (interface{}, int, error) {
	if r.Method != http.MethodPost {
		return nil, http.StatusMethodNotAllowed, nil
	}

	if err := r.ParseMultipartForm(64 << 20); err != nil {
		return nil, http.StatusBadRequest, err
	}

	file, _, err := r.FormFile("audio")
	if err != nil {
		return nil, http.StatusBadRequest, err
	}
	defer file.Close()

	audioData, err := io.ReadAll(file)
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}

	transcript := r.FormValue("transcript")
	if transcript == "" {
		return nil, http.StatusBadRequest, nil
	}

	speakerID := r.FormValue("speakerId")
	var metadata map[string]interface{}
	if metaStr := r.FormValue("metadata"); metaStr != "" {
		json.Unmarshal([]byte(metaStr), &metadata)
	}

	req := &types.CorpusUploadRequest{
		Transcript: transcript,
		SpeakerID:  speakerID,
		Metadata:   metadata,
	}

	corpusID, err := h.jobService.UploadCorpus(r.Context(), req, audioData)
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}

	return map[string]interface{}{
		"corpusId":       corpusID,
		"audioSize":      len(audioData),
		"transcriptLen":  len(transcript),
	}, http.StatusOK, nil
}

// Corpus batch upload
func (h *Handler) BatchUploadCorpus(w http.ResponseWriter, r *http.Request) (interface{}, int, error) {
	if r.Method != http.MethodPost {
		return nil, http.StatusMethodNotAllowed, nil
	}

	var req struct {
		CorpusData []*types.CorpusUploadRequest `json:"corpusData"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return nil, http.StatusBadRequest, err
	}

	results := make([]map[string]interface{}, 0)
	for _, item := range req.CorpusData {
		corpusID, err := h.jobService.UploadCorpus(r.Context(), item, item.Audio)
		if err != nil {
			results = append(results, map[string]interface{}{
				"success": false,
				"error":   err.Error(),
			})
		} else {
			results = append(results, map[string]interface{}{
				"success":  true,
				"corpusId": corpusID,
			})
		}
	}

	return map[string]interface{}{
		"results": results,
	}, http.StatusOK, nil
}

// Corpus query
func (h *Handler) QueryCorpus(w http.ResponseWriter, r *http.Request) (interface{}, int, error) {
	if r.Method != http.MethodGet {
		return nil, http.StatusMethodNotAllowed, nil
	}

	query := &types.CorpusQuery{
		CorpusID:  r.URL.Query().Get("corpusId"),
		SpeakerID: r.URL.Query().Get("speakerId"),
		StartTime: r.URL.Query().Get("startTime"),
		EndTime:   r.URL.Query().Get("endTime"),
	}
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		query.Limit, _ = strconv.Atoi(limitStr)
	}
	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		query.Offset, _ = strconv.Atoi(offsetStr)
	}

	results, err := h.jobService.QueryCorpus(r.Context(), query)
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}

	return map[string]interface{}{
		"query":  query,
		"results": results,
		"count":   len(results),
	}, http.StatusOK, nil
}

// Corpus stats
func (h *Handler) CorpusStats(w http.ResponseWriter, r *http.Request) (interface{}, int, error) {
	if r.Method != http.MethodGet {
		return nil, http.StatusMethodNotAllowed, nil
	}

	stats, err := h.jobService.GetCorpusStats(r.Context())
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}

	return stats, http.StatusOK, nil
}

// Logs query
func (h *Handler) GetLogs(w http.ResponseWriter, r *http.Request) (interface{}, int, error) {
	if r.Method != http.MethodGet {
		return nil, http.StatusMethodNotAllowed, nil
	}

	limit := 100
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		limit, _ = strconv.Atoi(limitStr)
	}

	logs := h.jobService.GetRecentLogs(limit)
	return map[string]interface{}{
		"logs": logs,
	}, http.StatusOK, nil
}

// Logs upload
func (h *Handler) UploadLogs(w http.ResponseWriter, r *http.Request) (interface{}, int, error) {
	if r.Method != http.MethodPost {
		return nil, http.StatusMethodNotAllowed, nil
	}

	var req types.LogsUploadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return nil, http.StatusBadRequest, err
	}

	if err := h.jobService.SaveClientLogs(req.Logs); err != nil {
		return nil, http.StatusInternalServerError, err
	}

	return map[string]interface{}{
		"message": "Logs uploaded successfully",
		"count":   len(req.Logs),
	}, http.StatusOK, nil
}

// Logs query with filters
func (h *Handler) QueryLogs(w http.ResponseWriter, r *http.Request) (interface{}, int, error) {
	if r.Method != http.MethodGet {
		return nil, http.StatusMethodNotAllowed, nil
	}

	limit := 100
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		limit, _ = strconv.Atoi(limitStr)
	}

	logs, err := h.jobService.QueryLogs(
		r.URL.Query().Get("startTime"),
		r.URL.Query().Get("endTime"),
		types.LogLevel(r.URL.Query().Get("level")),
		limit,
	)
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}

	return map[string]interface{}{
		"logs":     logs,
		"total":    len(logs),
		"returned": len(logs),
	}, http.StatusOK, nil
}

// Logs stats
func (h *Handler) LogsStats(w http.ResponseWriter, r *http.Request) (interface{}, int, error) {
	if r.Method != http.MethodGet {
		return nil, http.StatusMethodNotAllowed, nil
	}

	stats := h.jobService.GetLogsStats()
	return stats, http.StatusOK, nil
}

// SetupRoutes sets up all HTTP routes with idempotency middleware
func (h *Handler) SetupRoutes(mux *http.ServeMux) {
	handler = h

	// Health & Stats
	mux.HandleFunc("/api/health", h.wrap(h.HealthCheck))
	mux.HandleFunc("/api/stats", h.wrap(h.Stats))

	// Audio
	mux.HandleFunc("/api/audio/upload", h.wrapIdempotent(h.UploadAudio))

	// ASR
	mux.HandleFunc("/api/asr/jobs", h.wrapIdempotent(h.SubmitASRJob))
	mux.HandleFunc("/api/whisper-asr", h.wrapIdempotent(h.SubmitASRJob)) // Legacy path
	mux.HandleFunc("/api/asr/jobs/status", h.wrapIdempotent(h.GetASRJobStatus))

	// TTS
	mux.HandleFunc("/api/tts/jobs", h.wrapIdempotent(h.SubmitTTSJob))
	mux.HandleFunc("/api/tts/voice-clone", h.wrapIdempotent(h.SubmitVoiceCloneJob))
	mux.HandleFunc("/api/tts/jobs/status", h.wrapIdempotent(h.GetTTSJobStatus))

	// Corpus
	mux.HandleFunc("/api/corpus/upload", h.wrapIdempotent(h.UploadCorpus))
	mux.HandleFunc("/api/corpus/batch-upload", h.wrapIdempotent(h.BatchUploadCorpus))
	mux.HandleFunc("/api/corpus/query", h.wrapIdempotent(h.QueryCorpus))
	mux.HandleFunc("/api/corpus/stats", h.wrapIdempotent(h.CorpusStats))

	// Logs
	mux.HandleFunc("/api/client-logs", h.wrapIdempotent(h.GetLogs))
	mux.HandleFunc("/api/logs/client-upload", h.wrapIdempotent(h.UploadLogs))
	mux.HandleFunc("/api/logs/query", h.wrapIdempotent(h.QueryLogs))
	mux.HandleFunc("/api/logs/stats", h.wrapIdempotent(h.LogsStats))
}

// wrap wraps a handler to use Success/Error helpers
func (h *Handler) wrap(f func(w http.ResponseWriter, r *http.Request)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		f(w, r)
	}
}

// wrapIdempotent wraps a handler with idempotency support
func (h *Handler) wrapIdempotent(f func(w http.ResponseWriter, r *http.Request) (interface{}, int, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		idempKey := r.Header.Get(types.IdempotencyKeyHeader)

		// Check idempotency cache
		if idempKey != "" {
			if found, rec := h.jobService.CheckIdempotency(idempKey); found {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("X-Idempotency-Replay", "true")
				w.WriteHeader(rec.StatusCode)
				w.Write(rec.Response)
				return
			}
		}

		data, status, err := f(w, r)
		if err != nil {
			Error(w, status, err.Error())
			return
		}

		// Store idempotency result
		if idempKey != "" {
			resp, _ := json.Marshal(types.Response{OK: true, Data: data})
			h.jobService.StoreIdempotency(idempKey, resp, status)
		}

		Success(w, data)
	}
}
