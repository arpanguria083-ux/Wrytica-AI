# LM Studio Integration Fixes

## Issues Fixed

### 1. Invalid max_tokens Parameter
**Problem**: `max_tokens: -1` caused 400 Bad Request
**Solution**: Changed to `max_tokens: 2048`

### 2. Wrong Model Name
**Problem**: Default `'local-model'` doesn't exist in LM Studio
**Solution**: Updated to `'microsoft/phi-4-mini-reasoning'` (your first available model)

### 3. No Model Auto-Detection
**Problem**: Hard-coded model names fail if model isn't available
**Solution**: Added fallback to fetch first available model from `/v1/models`

### 4. Poor Error Messages
**Problem**: Generic error messages didn't help debug issues
**Solution**: Added specific messages for common LM Studio problems

## Files Modified
- `services/localLlmService.ts`: Fixed request parameters and error handling
- `utils.ts`: Updated default LM Studio model name

## Testing
1. Ensure a model is loaded in LM Studio
2. Go to Settings page in the app
3. Select "LM Studio" provider
4. Click "Test Connection" - should show success
5. Try paraphrasing text - should work without 400 errors

## Common Issues
- **Timeout**: Model not loaded in LM Studio interface
- **400 Error**: Invalid parameters (now fixed)
- **Connection Refused**: LM Studio not running