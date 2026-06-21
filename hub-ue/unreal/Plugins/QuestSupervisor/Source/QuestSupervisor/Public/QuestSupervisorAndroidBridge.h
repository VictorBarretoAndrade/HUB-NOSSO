#pragma once

#include "CoreMinimal.h"

struct FQuestSupervisorStreamingConfig
{
    FString Resolution = TEXT("1920x1080");
    int32 BitrateKbps = 16000;
    int32 TargetFps = 72;
    bool bEnableAudio = true;
};

struct FQuestSupervisorBatteryTelemetry
{
    bool bHasBatteryPct = false;
    bool bHasTemperatureC = false;
    float BatteryPct = 0.0f;
    float TemperatureC = 0.0f;
};

class QUESTSUPERVISOR_API FQuestSupervisorAndroidBridge
{
public:
    bool Initialize();
    void Shutdown();

    bool RequestMediaProjectionPermission();
    bool StartScreenCapture();
    void StopScreenCapture();

    bool ConfigureVideoEncoder(const FQuestSupervisorStreamingConfig& Config);
    bool StartWebRtcStream(const FString& PeerId);
    void StopWebRtcStream();

    bool IsAvailable() const;
    bool ReadBatteryTelemetry(FQuestSupervisorBatteryTelemetry& OutTelemetry) const;

private:
    bool bInitialized = false;
    bool bStreaming = false;
};
