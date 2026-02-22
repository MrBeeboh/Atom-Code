# Services Directory

This directory previously contained backend FastAPI services for vision and OCR processing.

Those services have been removed. Vision tasks are now handled directly by
LM Studio's vision-capable models (Qwen3-VL-4B, Qwen3-VL-8B, etc.)
running on port 1234.

The `.venv` directory here can be safely deleted if not used by other tooling.
