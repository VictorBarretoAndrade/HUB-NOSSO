#include "QuestSupervisorAndroidBridge.h"

#include "QuestSupervisorModule.h"

#if !PLATFORM_ANDROID
bool FQuestSupervisorAndroidBridge::Initialize()
{
    bInitialized = true;
    return true;
}

void FQuestSupervisorAndroidBridge::Shutdown()
{
    bStreaming = false;
    bInitialized = false;
}

bool FQuestSupervisorAndroidBridge::RequestMediaProjectionPermission()
{
    return false;
}

bool FQuestSupervisorAndroidBridge::StartScreenCapture()
{
    return false;
}

void FQuestSupervisorAndroidBridge::StopScreenCapture()
{
}

bool FQuestSupervisorAndroidBridge::ConfigureVideoEncoder(const FQuestSupervisorStreamingConfig& Config)
{
    UE_LOG(LogQuestSupervisor, Log, TEXT("QuestSupervisor encoder configured: %s @ %d kbps"), *Config.Resolution, Config.BitrateKbps);
    return bInitialized;
}

bool FQuestSupervisorAndroidBridge::StartWebRtcStream(const FString& PeerId)
{
    bStreaming = bInitialized && !PeerId.IsEmpty();
    return bStreaming;
}

void FQuestSupervisorAndroidBridge::StopWebRtcStream()
{
    bStreaming = false;
}

bool FQuestSupervisorAndroidBridge::IsAvailable() const
{
    return bInitialized;
}

bool FQuestSupervisorAndroidBridge::ReadBatteryTelemetry(FQuestSupervisorBatteryTelemetry& OutTelemetry) const
{
    OutTelemetry = FQuestSupervisorBatteryTelemetry{};
    return false;
}
#endif
