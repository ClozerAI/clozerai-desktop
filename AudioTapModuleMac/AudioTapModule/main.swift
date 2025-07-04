//
//  main.swift
//  ScreenCaptureModule
//
//

import Foundation
import ScreenCaptureKit
import AVFoundation
import CoreMedia                     // ASBD helpers

// ──────────────────────────────────────────────────────────────
// MARK: – Globals that must stay alive
// ──────────────────────────────────────────────────────────────
private var captureStream:   SCStream?
private var audioSink:       AudioSink?
private var streamDelegate:  StreamDelegate?   //  ← keep strong ref
private var shareableContent: SCShareableContent?

// ──────────────────────────────────────────────────────────────
// MARK: – Permission helper
// ──────────────────────────────────────────────────────────────
func checkOrRequestPermissionOrExit() {
    let sema = DispatchSemaphore(value: 0)
    Task.detached {
        do {
            shareableContent = try await SCShareableContent.excludingDesktopWindows(false,
                                                                     onScreenWindowsOnly: false)
            sema.signal()
        } catch {
            debugPrint("ERROR: Microphone/System Audio access denied. Please go to System Settings > Privacy & Security > Screen & System Audio Recording, and grant access to ClozerAI.")
            exit(1)
        }
    }
    sema.wait()
}

// ──────────────────────────────────────────────────────────────
// MARK: – Logging + PCM writer
// ──────────────────────────────────────────────────────────────
@inline(__always)
func debugPrint(_ msg: String) {
    FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
    fflush(stderr)
}

func writeAudio(from sb: CMSampleBuffer) {
    do {
        try sb.withAudioBufferList { list, _ in
            for buf in list {
                guard let ptr = buf.mData else { continue }
                let pcm = Data(bytesNoCopy: ptr,
                               count: Int(buf.mDataByteSize),
                               deallocator: .none)
                FileHandle.standardOutput.write(pcm)
            }
            fflush(stdout)
        }
    } catch { debugPrint("ERROR: Audio write error: \(error)") }
}

// ──────────────────────────────────────────────────────────────
// MARK: – Minimal SCStreamOutput implementation
// ──────────────────────────────────────────────────────────────
final class AudioSink: NSObject, SCStreamOutput {
    func stream(_ stream: SCStream,
                didOutputSampleBuffer sb: CMSampleBuffer,
                of type: SCStreamOutputType) {
        guard type == .audio else { return }
        writeAudio(from: sb)
    }
}

// ──────────────────────────────────────────────────────────────
// MARK: – Stream delegate
// ──────────────────────────────────────────────────────────────
final class StreamDelegate: NSObject, SCStreamDelegate {
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        debugPrint("ERROR: Screen Capture stream stopped - \(error)")
        exit(1) // Or implement restart logic
    }
}

// ──────────────────────────────────────────────────────────────
// MARK: – Capture bootstrap
// ──────────────────────────────────────────────────────────────
func startCapture() async throws {
    guard let content = shareableContent,
            let display = content.displays.first else {
        debugPrint("ERROR: No display found – cannot start capture.")
        exit(1)
    }

    let filter = SCContentFilter(display: display,
                                    excludingApplications: [],
                                    exceptingWindows: [])

    let cfg = SCStreamConfiguration()
    cfg.capturesAudio               = true
    cfg.excludesCurrentProcessAudio = false
    cfg.sampleRate                  = 16_000
    cfg.channelCount                = 1

    let delegate = StreamDelegate()
    streamDelegate = delegate           //  ← strong reference

    let stream = SCStream(filter: filter,
                            configuration: cfg,
                            delegate: delegate)

    let sink   = AudioSink()
    try stream.addStreamOutput(sink,
                                type: .audio,
                                sampleHandlerQueue: DispatchQueue(label: "SCKitAudioCapture"))

    // 🔴 Hold the objects globally so they outlive this function
    captureStream = stream
    audioSink     = sink

    debugPrint("INFO: Starting ScreenCaptureKit audio stream")
    try await stream.startCapture()
}

// ──────────────────────────────────────────────────────────────
// MARK: – Main
// ──────────────────────────────────────────────────────────────
checkOrRequestPermissionOrExit()

Task.detached {
    do { try await startCapture() }
    catch {
        debugPrint("ERROR: Capture failed: \(error)")
        exit(1)
    }
}

RunLoop.main.run()                              // keep CLI alive
