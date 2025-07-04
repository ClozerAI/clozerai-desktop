// Build using cl.exe /EHsc AudioTapModule.cpp /link ole32.lib oleaut32.lib user32.lib kernel32.lib

#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audiopolicy.h>
#include <iostream>
#include <comdef.h>
#include <io.h>
#include <fcntl.h>
#include <string>
#include <stdexcept>

// Audio format constants to match Speechmatics config
const DWORD TARGET_SAMPLE_RATE = 16000;   // 16kHz

// Debug print function similar to Swift's debugPrint
inline void DebugPrint(const std::string& msg) {
    std::cerr << msg << std::endl;
}

class AudioCapture {
private:
    IMMDeviceEnumerator* pEnumerator = nullptr;
    IMMDevice* pDevice = nullptr;
    IAudioClient* pAudioClient = nullptr;
    IAudioCaptureClient* pCaptureClient = nullptr;
    WAVEFORMATEX* pwfx = nullptr;
    UINT32 bufferFrameCount = 0;
    bool initialized = false;

public:
    ~AudioCapture() {
        Cleanup();
    }

    HRESULT Initialize() {
        DebugPrint("INFO: Initializing audio capture...");
        HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
        if (FAILED(hr)) { DebugPrint("CoInitializeEx failed: 0x" + std::to_string(hr)); return hr; }

        // Create device enumerator
        hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                             __uuidof(IMMDeviceEnumerator), (void**)&pEnumerator);
        if (FAILED(hr)) { DebugPrint("CoCreateInstance failed: 0x" + std::to_string(hr)); return hr; }

        // Get default audio endpoint (speakers) for loopback capture
        hr = pEnumerator->GetDefaultAudioEndpoint(eRender, eConsole, &pDevice);
        if (FAILED(hr)) { DebugPrint("GetDefaultAudioEndpoint failed: 0x" + std::to_string(hr)); return hr; }

        // Activate audio client
        hr = pDevice->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, (void**)&pAudioClient);
        if (FAILED(hr)) { DebugPrint("Activate failed: 0x" + std::to_string(hr)); return hr; }

        // Get the mix format - we MUST use this format for loopback mode
        hr = pAudioClient->GetMixFormat(&pwfx);
        if (FAILED(hr)) { DebugPrint("GetMixFormat failed: 0x" + std::to_string(hr)); return hr; }

        // Initialize audio client in loopback mode using the device's native format
        hr = pAudioClient->Initialize(AUDCLNT_SHAREMODE_SHARED,
                                     AUDCLNT_STREAMFLAGS_LOOPBACK,
                                     10000000,  // 1 second buffer
                                     0,
                                     pwfx,      // Use native format, not our target format
                                     nullptr);
        if (FAILED(hr)) { DebugPrint("AudioClient Initialize failed: 0x" + std::to_string(hr)); return hr; }

        // Get buffer size
        hr = pAudioClient->GetBufferSize(&bufferFrameCount);
        if (FAILED(hr)) { DebugPrint("GetBufferSize failed: 0x" + std::to_string(hr)); return hr; }

        // Get capture client
        hr = pAudioClient->GetService(__uuidof(IAudioCaptureClient), (void**)&pCaptureClient);
        if (FAILED(hr)) { DebugPrint("GetService(IAudioCaptureClient) failed: 0x" + std::to_string(hr)); return hr; }

        initialized = true;
        DebugPrint("INFO: Audio capture initialized successfully.");
        return S_OK;
    }

    HRESULT StartCapture() {
        if (!initialized) { DebugPrint("StartCapture called before initialization."); return E_FAIL; }
        DebugPrint("INFO: Starting audio capture...");
        return pAudioClient->Start();
    }

    // Convert stereo float32 to mono int16 at 16kHz
    void ConvertStereoFloat32ToMono16(float* input, int16_t* output, UINT32 frames, UINT32 inputSampleRate) {
        if (!input || !output) {
            DebugPrint("Null buffer provided to conversion function");
        }
        if (inputSampleRate == 0) {
            DebugPrint("Invalid sample rate (0) provided to conversion function");
        }
        
        double ratio = (double)inputSampleRate / TARGET_SAMPLE_RATE;
        if (ratio <= 0) {
            DebugPrint("Invalid sample rate ratio calculated");
        }
        
        UINT32 outputFrames = (UINT32)(frames / ratio);
        if (outputFrames == 0) {
            DebugPrint("No output frames calculated for conversion");
        }
        
        for (UINT32 i = 0; i < outputFrames; i++) {
            UINT32 inputIndex = (UINT32)(i * ratio);
            if (inputIndex >= frames) {
                DebugPrint("Buffer overflow detected in conversion");
            }
            
            float left = input[inputIndex * 2];
            float right = input[inputIndex * 2 + 1];
            
            if (std::isnan(left) || std::isinf(left) || std::isnan(right) || std::isinf(right)) {
                DebugPrint("Invalid audio sample detected (NaN or Inf)");
            }
            
            float mono = (left + right) * 0.5f;
            if (mono > 1.0f) mono = 1.0f;
            if (mono < -1.0f) mono = -1.0f;
            output[i] = (int16_t)(mono * 32767.0f);
        }
        
        if (!std::cout.write((char*)output, outputFrames * sizeof(int16_t))) {
            DebugPrint("Failed to write audio data to output stream");
        }
        if (!std::cout.flush()) {
            DebugPrint("Failed to flush audio data to output stream");
        }
    }

    // Convert mono float32 to mono int16 at 16kHz
    void ConvertMonoFloat32ToMono16(float* input, int16_t* output, UINT32 frames, UINT32 inputSampleRate) {
        if (!input || !output) {
            DebugPrint("Null buffer provided to conversion function");
        }
        if (inputSampleRate == 0) {
            DebugPrint("Invalid sample rate (0) provided to conversion function");
        }
        
        double ratio = (double)inputSampleRate / TARGET_SAMPLE_RATE;
        if (ratio <= 0) {
            DebugPrint("Invalid sample rate ratio calculated");
        }
        
        UINT32 outputFrames = (UINT32)(frames / ratio);
        if (outputFrames == 0) {
            DebugPrint("No output frames calculated for conversion");
        }
        
        for (UINT32 i = 0; i < outputFrames; i++) {
            UINT32 inputIndex = (UINT32)(i * ratio);
            if (inputIndex >= frames) {
                DebugPrint("Buffer overflow detected in conversion");
            }
            
            float sample = input[inputIndex];
            if (std::isnan(sample) || std::isinf(sample)) {
                DebugPrint("Invalid audio sample detected (NaN or Inf)");
            }
            
            // Clamp and convert to int16
            if (sample > 1.0f) sample = 1.0f;
            if (sample < -1.0f) sample = -1.0f;
            output[i] = (int16_t)(sample * 32767.0f);
        }
        
        // Output the converted data
        if (!std::cout.write((char*)output, outputFrames * sizeof(int16_t))) {
            DebugPrint("Failed to write audio data to output stream");
        }
        if (!std::cout.flush()) {
            DebugPrint("Failed to flush audio data to output stream");
        }
    }

    // Convert stereo int16 to mono int16 at 16kHz
    void ConvertStereoInt16ToMono16(int16_t* input, int16_t* output, UINT32 frames, UINT32 inputSampleRate) {
        if (!input || !output) {
            DebugPrint("Null buffer provided to conversion function");
        }
        if (inputSampleRate == 0) {
            DebugPrint("Invalid sample rate (0) provided to conversion function");
        }
        
        double ratio = (double)inputSampleRate / TARGET_SAMPLE_RATE;
        if (ratio <= 0) {
            DebugPrint("Invalid sample rate ratio calculated");
        }
        
        UINT32 outputFrames = (UINT32)(frames / ratio);
        if (outputFrames == 0) {
            DebugPrint("No output frames calculated for conversion");
        }
        
        for (UINT32 i = 0; i < outputFrames; i++) {
            UINT32 inputIndex = (UINT32)(i * ratio);
            if (inputIndex >= frames) {
                DebugPrint("Buffer overflow detected in conversion");
            }
            
            int32_t left = input[inputIndex * 2];
            int32_t right = input[inputIndex * 2 + 1];
            output[i] = (int16_t)((left + right) / 2);
        }
        
        if (!std::cout.write((char*)output, outputFrames * sizeof(int16_t))) {
            DebugPrint("Failed to write audio data to output stream");
        }
        if (!std::cout.flush()) {
            DebugPrint("Failed to flush audio data to output stream");
        }
    }

    HRESULT CaptureLoop() {
        if (!initialized) {
            DebugPrint("CaptureLoop called before initialization");
            return E_FAIL;
        }
        DebugPrint("INFO: Entering audio capture loop...");

        // Allocate conversion buffer
        const UINT32 maxOutputFrames = (bufferFrameCount * TARGET_SAMPLE_RATE) / pwfx->nSamplesPerSec + 1;
        int16_t* outputBuffer = nullptr;
        try {
            outputBuffer = new int16_t[maxOutputFrames];
        } catch (const std::bad_alloc&) {
            DebugPrint("Failed to allocate conversion buffer");
            return E_OUTOFMEMORY;
        }

        while (true) {
            UINT32 packetLength = 0;
            HRESULT hr = pCaptureClient->GetNextPacketSize(&packetLength);
            if (FAILED(hr)) {
                DebugPrint("GetNextPacketSize failed: 0x" + std::to_string(hr));
                break;
            }

            if (packetLength == 0) {
                Sleep(1);
                continue;
            }

            BYTE* pData;
            UINT32 numFramesAvailable;
            DWORD flags;

            hr = pCaptureClient->GetBuffer(&pData, &numFramesAvailable, &flags, nullptr, nullptr);
            if (FAILED(hr)) {
                DebugPrint("GetBuffer failed: 0x" + std::to_string(hr));
                break;
            }

            if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
                try {
                    double ratio = (double)pwfx->nSamplesPerSec / TARGET_SAMPLE_RATE;
                    UINT32 outputFrames = (UINT32)(numFramesAvailable / ratio);
                    size_t silenceBytes = outputFrames * sizeof(int16_t);
                    std::unique_ptr<char[]> silence(new char[silenceBytes]());
                    
                    if (!std::cout.write(silence.get(), silenceBytes)) {
                        DebugPrint("Failed to write silence data to output stream");
                    }
                    if (!std::cout.flush()) {
                        DebugPrint("Failed to flush silence data to output stream");
                    }
                } catch (const std::bad_alloc&) {
                    DebugPrint("Failed to allocate silence buffer");
                    break;
                }
            } else {
                if (pwfx->wFormatTag == WAVE_FORMAT_EXTENSIBLE) {
                    WAVEFORMATEXTENSIBLE* wfext = (WAVEFORMATEXTENSIBLE*)pwfx;
                    if (IsEqualGUID(wfext->SubFormat, KSDATAFORMAT_SUBTYPE_IEEE_FLOAT)) {
                        if (pwfx->nChannels == 2) {
                            ConvertStereoFloat32ToMono16((float*)pData, outputBuffer, numFramesAvailable, pwfx->nSamplesPerSec);
                        } else if (pwfx->nChannels == 1) {
                            ConvertMonoFloat32ToMono16((float*)pData, outputBuffer, numFramesAvailable, pwfx->nSamplesPerSec);
                        } else {
                            DebugPrint("Unsupported number of channels: " + std::to_string(pwfx->nChannels));
                        }
                    } else if (IsEqualGUID(wfext->SubFormat, KSDATAFORMAT_SUBTYPE_PCM)) {
                        if (pwfx->nChannels == 2 && pwfx->wBitsPerSample == 16) {
                            ConvertStereoInt16ToMono16((int16_t*)pData, outputBuffer, numFramesAvailable, pwfx->nSamplesPerSec);
                        } else {
                            DebugPrint("Unsupported PCM format: " + std::to_string(pwfx->nChannels) + " channels, " + std::to_string(pwfx->wBitsPerSample) + " bits");
                        }
                    } else {
                        DebugPrint("Unsupported audio format subtype");
                    }
                } else if (pwfx->wFormatTag == WAVE_FORMAT_PCM) {
                    if (pwfx->nChannels == 2 && pwfx->wBitsPerSample == 16) {
                        ConvertStereoInt16ToMono16((int16_t*)pData, outputBuffer, numFramesAvailable, pwfx->nSamplesPerSec);
                    } else {
                        DebugPrint("Unsupported PCM format: " + std::to_string(pwfx->nChannels) + " channels, " + std::to_string(pwfx->wBitsPerSample) + " bits");
                    }
                } else {
                    DebugPrint("Unknown audio format: " + std::to_string(pwfx->wFormatTag));
                }
            }

            hr = pCaptureClient->ReleaseBuffer(numFramesAvailable);
            if (FAILED(hr)) {
                DebugPrint("ReleaseBuffer failed: 0x" + std::to_string(hr));
                break;
            }
        }

        delete[] outputBuffer;
        return S_OK;
    }

    void Cleanup() {
        DebugPrint("INFO: Cleaning up audio capture resources...");
        if (pAudioClient) {
            pAudioClient->Stop();
            HRESULT hr = pAudioClient->Release();
            if (FAILED(hr)) {
                DebugPrint("Failed to release audio client: 0x" + std::to_string(hr));
            }
            pAudioClient = nullptr;
        }
        if (pCaptureClient) {
            HRESULT hr = pCaptureClient->Release();
            if (FAILED(hr)) {
                DebugPrint("Failed to release capture client: 0x" + std::to_string(hr));
            }
            pCaptureClient = nullptr;
        }
        if (pDevice) {
            HRESULT hr = pDevice->Release();
            if (FAILED(hr)) {
                DebugPrint("Failed to release device: 0x" + std::to_string(hr));
            }
            pDevice = nullptr;
        }
        if (pEnumerator) {
            HRESULT hr = pEnumerator->Release();
            if (FAILED(hr)) {
                DebugPrint("Failed to release enumerator: 0x" + std::to_string(hr));
            }
            pEnumerator = nullptr;
        }
        if (pwfx) {
            CoTaskMemFree(pwfx);
            pwfx = nullptr;
        }
        CoUninitialize();
    }
};

int main() {
    // Set stdout to binary mode
    _setmode(_fileno(stdout), _O_BINARY);
    DebugPrint("INFO: AudioTapModule starting up...");
    AudioCapture capture;
    
    HRESULT hr = capture.Initialize();
    if (FAILED(hr)) {
        DebugPrint("Failed to initialize audio capture: 0x" + std::to_string(hr));
        return 1;
    }

    hr = capture.StartCapture();
    if (FAILED(hr)) {
        DebugPrint("Failed to start audio capture: 0x" + std::to_string(hr));
        return 1;
    }

    // Start the capture loop
    capture.CaptureLoop();
    
    DebugPrint("INFO: AudioTapModule exiting.");
    return 0;
}
