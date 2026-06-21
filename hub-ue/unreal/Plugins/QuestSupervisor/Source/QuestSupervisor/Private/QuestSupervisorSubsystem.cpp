#include "QuestSupervisorSubsystem.h"

#include "Containers/Ticker.h"
#include "Dom/JsonObject.h"
#include "GenericPlatform/GenericPlatformHttp.h"
#include "HAL/PlatformMemory.h"
#include "HAL/PlatformProcess.h"
#include "HAL/PlatformTime.h"
#include "IWebSocket.h"
#include "Misc/App.h"
#include "Misc/CommandLine.h"
#include "Misc/DateTime.h"
#include "Misc/Guid.h"
#include "Misc/Parse.h"
#include "Modules/ModuleManager.h"
#include "QuestSupervisorModule.h"
#include "QuestSupervisorSettings.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "WebSocketsModule.h"

namespace
{
    constexpr int32 MaxQueuedMessages = 64;
    const TCHAR* TopicUnrealState = TEXT("unreal.state");
    const TCHAR* TopicUnrealCommands = TEXT("unreal.commands");
    const TCHAR* TopicExperienceLifecycle = TEXT("experience.lifecycle");
    const TCHAR* TopicExperienceMarker = TEXT("experience.marker");
    const TCHAR* TopicLoggerEvents = TEXT("logger.events");

    FString DeviceStatusToString(EQuestSupervisorDeviceStatus Status)
    {
        switch (Status)
        {
        case EQuestSupervisorDeviceStatus::Online:
            return TEXT("online");
        case EQuestSupervisorDeviceStatus::Idle:
            return TEXT("idle");
        case EQuestSupervisorDeviceStatus::Busy:
            return TEXT("busy");
        case EQuestSupervisorDeviceStatus::Error:
            return TEXT("error");
        case EQuestSupervisorDeviceStatus::Offline:
        default:
            return TEXT("offline");
        }
    }

    FString LogLevelToString(EQuestSupervisorLogLevel Level)
    {
        switch (Level)
        {
        case EQuestSupervisorLogLevel::Debug:
            return TEXT("debug");
        case EQuestSupervisorLogLevel::Warn:
            return TEXT("warn");
        case EQuestSupervisorLogLevel::Error:
            return TEXT("error");
        case EQuestSupervisorLogLevel::Info:
        default:
            return TEXT("info");
        }
    }

    EQuestSupervisorCommandTarget StringToCommandTarget(const FString& Value)
    {
        if (Value.Equals(TEXT("batch"), ESearchCase::IgnoreCase))
        {
            return EQuestSupervisorCommandTarget::Batch;
        }

        return EQuestSupervisorCommandTarget::Single;
    }

    TSharedPtr<FJsonObject> BuildCapabilitiesObject(const FQuestSupervisorDeviceCapabilities& Capabilities)
    {
        TSharedPtr<FJsonObject> Object = MakeShared<FJsonObject>();
        Object->SetBoolField(TEXT("sceneLoading"), Capabilities.bSceneLoading);
        Object->SetBoolField(TEXT("telemetry"), Capabilities.bTelemetry);
        Object->SetBoolField(TEXT("commandExecution"), Capabilities.bCommandExecution);
        Object->SetBoolField(TEXT("logs"), Capabilities.bLogs);
        Object->SetBoolField(TEXT("futureStreaming"), Capabilities.bFutureStreaming);
        return Object;
    }

    TArray<TSharedPtr<FJsonValue>> BuildCapabilityList(const FQuestSupervisorDeviceCapabilities& Capabilities)
    {
        TArray<TSharedPtr<FJsonValue>> Values;
        if (Capabilities.bSceneLoading)
        {
            Values.Add(MakeShared<FJsonValueString>(TEXT("sceneLoading")));
        }
        if (Capabilities.bTelemetry)
        {
            Values.Add(MakeShared<FJsonValueString>(TEXT("telemetry")));
        }
        if (Capabilities.bCommandExecution)
        {
            Values.Add(MakeShared<FJsonValueString>(TEXT("commandExecution")));
        }
        if (Capabilities.bLogs)
        {
            Values.Add(MakeShared<FJsonValueString>(TEXT("logs")));
        }
        if (Capabilities.bFutureStreaming)
        {
            Values.Add(MakeShared<FJsonValueString>(TEXT("futureStreaming")));
        }
        return Values;
    }

    TSharedPtr<FJsonObject> BuildTelemetryObject(const FQuestSupervisorTelemetrySnapshot& Telemetry)
    {
        TSharedPtr<FJsonObject> Object = MakeShared<FJsonObject>();
        Object->SetNumberField(TEXT("fps"), Telemetry.FPS);
        Object->SetNumberField(TEXT("latencyMs"), Telemetry.LatencyMs);
        Object->SetNumberField(TEXT("batteryPct"), Telemetry.BatteryPct);
        Object->SetNumberField(TEXT("cpuPct"), Telemetry.CpuPct);
        Object->SetNumberField(TEXT("gpuPct"), Telemetry.GpuPct);
        Object->SetNumberField(TEXT("memoryMb"), Telemetry.MemoryMb);
        Object->SetNumberField(TEXT("temperatureC"), Telemetry.TemperatureC);
        Object->SetNumberField(TEXT("packetLossPct"), Telemetry.PacketLossPct);
        Object->SetNumberField(TEXT("sessionElapsedSec"), Telemetry.SessionElapsedSec);
        return Object;
    }

    TSharedPtr<FJsonObject> BuildArgumentsObject(const TMap<FString, FString>& Arguments)
    {
        TSharedPtr<FJsonObject> Object = MakeShared<FJsonObject>();
        for (const TPair<FString, FString>& Pair : Arguments)
        {
            Object->SetStringField(Pair.Key, Pair.Value);
        }

        return Object;
    }

    bool ExtractCommandPayload(const TSharedPtr<FJsonObject>& PayloadObject, FQuestSupervisorCommandRequest& OutCommand)
    {
        if (!PayloadObject.IsValid())
        {
            return false;
        }

        if (!PayloadObject->TryGetStringField(TEXT("commandId"), OutCommand.CommandId))
        {
            PayloadObject->TryGetStringField(TEXT("id"), OutCommand.CommandId);
            if (OutCommand.CommandId.IsEmpty())
            {
                return false;
            }
        }

        if (!PayloadObject->TryGetStringField(TEXT("action"), OutCommand.Action))
        {
            return false;
        }

        FString Target;
        if (PayloadObject->TryGetStringField(TEXT("target"), Target))
        {
            OutCommand.Target = StringToCommandTarget(Target);
        }

        if (!PayloadObject->TryGetStringField(TEXT("issuedAt"), OutCommand.IssuedAt))
        {
            OutCommand.IssuedAt = FDateTime::UtcNow().ToIso8601();
        }

        OutCommand.Arguments.Reset();
        const TSharedPtr<FJsonValue>* ArgumentsValue = PayloadObject->Values.Find(TEXT("arguments"));
        if (ArgumentsValue && ArgumentsValue->IsValid())
        {
            const TSharedPtr<FJsonObject> ArgumentsObject = (*ArgumentsValue)->AsObject();
            if (ArgumentsObject.IsValid())
            {
                for (const TPair<FString, TSharedPtr<FJsonValue>>& Pair : ArgumentsObject->Values)
                {
                    FString StringValue = TEXT("{}");
                    if (Pair.Value.IsValid())
                    {
                        switch (Pair.Value->Type)
                        {
                        case EJson::String:
                            StringValue = Pair.Value->AsString();
                            break;
                        case EJson::Number:
                            StringValue = FString::SanitizeFloat(Pair.Value->AsNumber());
                            break;
                        case EJson::Boolean:
                            StringValue = Pair.Value->AsBool() ? TEXT("true") : TEXT("false");
                            break;
                        default:
                            break;
                        }
                    }

                    OutCommand.Arguments.Add(Pair.Key, StringValue);
                }
            }
        }

        return true;
    }

    FString BuildDefaultDeviceId()
    {
        FString ComputerName = FPlatformProcess::ComputerName();
        ComputerName.TrimStartAndEndInline();
        ComputerName.ReplaceInline(TEXT(" "), TEXT("-"));
        if (ComputerName.IsEmpty())
        {
            ComputerName = TEXT("unknown");
        }

        return FString::Printf(TEXT("unreal-%s"), *ComputerName);
    }

    FString NormalizeSupervisorEndpoint(const FString& RawEndpoint)
    {
        FString Endpoint = RawEndpoint.TrimStartAndEnd();
        if (Endpoint.IsEmpty())
        {
            return FString();
        }

        if (Endpoint.StartsWith(TEXT("http://")))
        {
            Endpoint = FString::Printf(TEXT("ws://%s"), *Endpoint.RightChop(7));
        }
        else if (Endpoint.StartsWith(TEXT("https://")))
        {
            Endpoint = FString::Printf(TEXT("wss://%s"), *Endpoint.RightChop(8));
        }
        else if (!Endpoint.StartsWith(TEXT("ws://")) && !Endpoint.StartsWith(TEXT("wss://")))
        {
            Endpoint = FString::Printf(TEXT("ws://%s"), *Endpoint);
        }

        if (!Endpoint.Contains(TEXT("/ws")))
        {
            Endpoint.RemoveFromEnd(TEXT("/"));
            Endpoint += TEXT("/ws");
        }

        return Endpoint;
    }
}

void UQuestSupervisorSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
    Super::Initialize(Collection);

    LoadRuntimeConfigFromIni();
    AndroidBridge.Initialize();
    TransportState = EQuestSupervisorTransportState::Disconnected;
    OutgoingMessages.Reset();
    LastHeartbeatTimestamp.Reset();
    LastRegistrationTimestamp.Reset();
    LastConnectedTimestamp.Reset();
    LastDisconnectedTimestamp.Reset();
    LastConnectionError.Reset();
    bHasRegistration = false;
    bHasHeartbeat = false;
    bIsRegistered = false;
    bIntentionalDisconnect = false;
    ReconnectAttempts = 0;
    SessionStartSeconds = 0.0;

    if (RuntimeConfig.bAutoConnectOnStartup)
    {
        StartSupervisor();
    }
}

void UQuestSupervisorSubsystem::Deinitialize()
{
    DisconnectTransport(true);
    AndroidBridge.Shutdown();

    OutgoingMessages.Reset();
    SupervisorEndpoint.Reset();
    LastHeartbeatTimestamp.Reset();
    LastRegistrationTimestamp.Reset();
    LastConnectedTimestamp.Reset();
    LastDisconnectedTimestamp.Reset();
    LastConnectionError.Reset();
    bHasRegistration = false;
    bHasHeartbeat = false;
    bIsRegistered = false;
    ReconnectAttempts = 0;
    SessionStartSeconds = 0.0;

    Super::Deinitialize();
}

void UQuestSupervisorSubsystem::LoadRuntimeConfigFromIni()
{
    FQuestSupervisorRuntimeConfig Config;
    const UQuestSupervisorSettings* Settings = GetDefault<UQuestSupervisorSettings>();
    if (Settings)
    {
        Config.bSupervisorEnabled = Settings->bSupervisorEnabled;
        Config.bAutoConnectOnStartup = Settings->bAutoConnectOnStartup;
        Config.SupervisorEndpoint = Settings->SupervisorEndpoint;
        Config.AuthToken = Settings->AuthToken;
        Config.bAutoAckCommands = Settings->bAutoAckCommands;
        Config.HeartbeatIntervalSeconds = Settings->HeartbeatIntervalSeconds;
        Config.InitialReconnectDelaySeconds = Settings->InitialReconnectDelaySeconds;
        Config.MaxReconnectDelaySeconds = Settings->MaxReconnectDelaySeconds;
        Config.DeviceId = Settings->DeviceId;
        Config.DeviceLabel = Settings->DeviceLabel;
        Config.AppId = Settings->AppId;
        Config.AppVersion = Settings->AppVersion;
        Config.HeadsetModel = Settings->HeadsetModel;
        Config.Capabilities = Settings->Capabilities;
    }

    FString CommandLineEndpoint;
    if (FParse::Value(FCommandLine::Get(), TEXT("QuestSupervisorEndpoint="), CommandLineEndpoint))
    {
        Config.SupervisorEndpoint = CommandLineEndpoint.TrimStartAndEnd();
    }

    FString CommandLineToken;
    if (FParse::Value(FCommandLine::Get(), TEXT("QuestSupervisorToken="), CommandLineToken))
    {
        Config.AuthToken = CommandLineToken.TrimStartAndEnd();
    }

    ApplyRuntimeConfig(Config);
}

bool UQuestSupervisorSubsystem::StartSupervisor()
{
    if (!RuntimeConfig.bSupervisorEnabled)
    {
        LastConnectionError = TEXT("QuestSupervisor is disabled by runtime config.");
        return false;
    }

    if (RuntimeConfig.SupervisorEndpoint.TrimStartAndEnd().IsEmpty())
    {
        LastConnectionError = TEXT("QuestSupervisor requires a SupervisorEndpoint before startup.");
        return false;
    }

    const bool bEndpointConfigured = ConfigureSupervisorEndpoint(RuntimeConfig.SupervisorEndpoint);
    const FQuestSupervisorDeviceRegistration Registration = BuildConfiguredRegistration();
    const bool bRegistrationQueued = RegisterDevice(Registration);

    SendHeartbeat(BuildConfiguredHeartbeat());
    SendSystemLog(TEXT("QuestSupervisor started from plugin settings."), EQuestSupervisorLogLevel::Info, TEXT("bootstrap"));
    return bEndpointConfigured && bRegistrationQueued;
}

void UQuestSupervisorSubsystem::StopSupervisor()
{
    DisconnectTransport(true);
}

void UQuestSupervisorSubsystem::ReloadSettings()
{
    LoadRuntimeConfigFromIni();
}

void UQuestSupervisorSubsystem::ApplyRuntimeConfig(const FQuestSupervisorRuntimeConfig& Config)
{
    RuntimeConfig = Config;
    RuntimeConfig.HeartbeatIntervalSeconds = FMath::Max(0.25f, RuntimeConfig.HeartbeatIntervalSeconds);
    RuntimeConfig.InitialReconnectDelaySeconds = FMath::Max(0.25f, RuntimeConfig.InitialReconnectDelaySeconds);
    RuntimeConfig.MaxReconnectDelaySeconds = FMath::Max(RuntimeConfig.InitialReconnectDelaySeconds, RuntimeConfig.MaxReconnectDelaySeconds);

    HeartbeatIntervalSeconds = RuntimeConfig.HeartbeatIntervalSeconds;
    InitialReconnectDelaySeconds = RuntimeConfig.InitialReconnectDelaySeconds;
    MaxReconnectDelaySeconds = RuntimeConfig.MaxReconnectDelaySeconds;

    const bool bRestartHeartbeat = HeartbeatTickerHandle.IsValid();
    if (bRestartHeartbeat)
    {
        StopHeartbeatLoop();
        StartHeartbeatLoop();
    }

    if (!RuntimeConfig.bSupervisorEnabled)
    {
        DisconnectTransport(true);
    }
}

void UQuestSupervisorSubsystem::SetSupervisorEnabled(bool bEnabled)
{
    RuntimeConfig.bSupervisorEnabled = bEnabled;
    if (!bEnabled)
    {
        DisconnectTransport(true);
        return;
    }

    bIntentionalDisconnect = false;
    if (!SupervisorEndpoint.IsEmpty())
    {
        ConnectTransport();
    }
}

void UQuestSupervisorSubsystem::SetAutoAckCommands(bool bEnabled)
{
    RuntimeConfig.bAutoAckCommands = bEnabled;
}

FQuestSupervisorDeviceRegistration UQuestSupervisorSubsystem::BuildConfiguredRegistration() const
{
    const FString ProjectName = FApp::GetProjectName();
    const FString DefaultDeviceId = BuildDefaultDeviceId();

    FQuestSupervisorDeviceRegistration Registration;
    Registration.DeviceId = RuntimeConfig.DeviceId.TrimStartAndEnd().IsEmpty() ? DefaultDeviceId : RuntimeConfig.DeviceId.TrimStartAndEnd();
    Registration.DeviceLabel = RuntimeConfig.DeviceLabel.TrimStartAndEnd().IsEmpty() ? Registration.DeviceId : RuntimeConfig.DeviceLabel.TrimStartAndEnd();
    Registration.AppId = RuntimeConfig.AppId.TrimStartAndEnd().IsEmpty() ? ProjectName : RuntimeConfig.AppId.TrimStartAndEnd();
    Registration.AppVersion = RuntimeConfig.AppVersion.TrimStartAndEnd().IsEmpty() ? TEXT("0.1.0") : RuntimeConfig.AppVersion.TrimStartAndEnd();
    Registration.HeadsetModel = RuntimeConfig.HeadsetModel.TrimStartAndEnd().IsEmpty() ? TEXT("Meta Quest 3") : RuntimeConfig.HeadsetModel.TrimStartAndEnd();
    Registration.SessionId = FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphensLower);
    Registration.Capabilities = RuntimeConfig.Capabilities;
    Registration.Timestamp = MakeIsoTimestamp();
    return Registration;
}

FQuestSupervisorHeartbeat UQuestSupervisorSubsystem::BuildConfiguredHeartbeat() const
{
    FQuestSupervisorHeartbeat Heartbeat;
    Heartbeat.DeviceId = CachedRegistration.DeviceId;
    Heartbeat.Timestamp = MakeIsoTimestamp();
    Heartbeat.Status = EQuestSupervisorDeviceStatus::Online;
    return Heartbeat;
}

bool UQuestSupervisorSubsystem::ConfigureSupervisorEndpoint(const FString& InEndpointUrl)
{
    if (!RuntimeConfig.bSupervisorEnabled)
    {
        LastConnectionError = TEXT("QuestSupervisor is disabled by runtime config.");
        DisconnectTransport(true);
        return false;
    }

    const FString NormalizedEndpoint = NormalizeSupervisorEndpoint(InEndpointUrl);
    if (NormalizedEndpoint.IsEmpty())
    {
        SupervisorEndpoint.Reset();
        DisconnectTransport(true);
        return false;
    }

    const bool bEndpointChanged = SupervisorEndpoint != NormalizedEndpoint;
    SupervisorEndpoint = NormalizedEndpoint;
    LastConnectionError.Reset();

    UE_LOG(LogQuestSupervisor, Log, TEXT("QuestSupervisor endpoint set to %s"), *BuildSafeEndpointForLog());

    if (bEndpointChanged)
    {
        DisconnectTransport(true);
    }

    bIntentionalDisconnect = false;
    return ConnectTransport();
}

bool UQuestSupervisorSubsystem::RegisterDevice(const FQuestSupervisorDeviceRegistration& Registration)
{
    if (!RuntimeConfig.bSupervisorEnabled)
    {
        LastConnectionError = TEXT("QuestSupervisor is disabled by runtime config.");
        return false;
    }

    CachedRegistration = Registration;
    if (CachedRegistration.DeviceId.IsEmpty())
    {
        UE_LOG(LogQuestSupervisor, Warning, TEXT("QuestSupervisor device registration requires a DeviceId."));
        return false;
    }

    bHasRegistration = true;
    bIsRegistered = false;
    SessionStartSeconds = FPlatformTime::Seconds();

    if (!bHasHeartbeat)
    {
        CachedHeartbeat.DeviceId = CachedRegistration.DeviceId;
        CachedHeartbeat.Status = EQuestSupervisorDeviceStatus::Online;
        bHasHeartbeat = true;
    }

    if (SupervisorEndpoint.IsEmpty())
    {
        UE_LOG(LogQuestSupervisor, Warning, TEXT("QuestSupervisor cannot register device before configuring the supervisor endpoint."));
        return false;
    }

    if (CanUseSocket())
    {
        const bool bRegistered = SendRegistrationMessage(true);
        SendSubscribeMessage();
        return bRegistered;
    }

    return ConnectTransport();
}

bool UQuestSupervisorSubsystem::SendHeartbeat(const FQuestSupervisorHeartbeat& Heartbeat)
{
    const FQuestSupervisorHeartbeat Payload = BuildHeartbeatPayload(&Heartbeat);
    if (Payload.DeviceId.IsEmpty())
    {
        return false;
    }

    CachedHeartbeat = Payload;
    bHasHeartbeat = true;
    LastHeartbeatTimestamp = Payload.Timestamp;

    TSharedPtr<FJsonObject> PayloadObject = MakeShared<FJsonObject>();
    PayloadObject->SetStringField(TEXT("deviceId"), Payload.DeviceId);
    PayloadObject->SetStringField(TEXT("status"), DeviceStatusToString(Payload.Status));
    PayloadObject->SetObjectField(TEXT("telemetry"), BuildTelemetryObject(Payload.Telemetry));
    return EmitJsonMessage(
        TEXT("publish"),
        PayloadObject,
        TopicUnrealState,
        FString(),
        false,
        Payload.Timestamp,
        static_cast<int64>(Payload.Telemetry.SessionElapsedSec * 1000.0f));
}

bool UQuestSupervisorSubsystem::SendLogEntry(const FQuestSupervisorLogEntry& Entry)
{
    const FQuestSupervisorLogEntry Payload = BuildLogPayload(Entry);
    if (Payload.DeviceId.IsEmpty())
    {
        return false;
    }

    TSharedPtr<FJsonObject> PayloadObject = MakeShared<FJsonObject>();
    PayloadObject->SetStringField(TEXT("deviceId"), Payload.DeviceId);
    PayloadObject->SetStringField(TEXT("level"), LogLevelToString(Payload.Level));
    PayloadObject->SetStringField(TEXT("message"), Payload.Message);
    PayloadObject->SetStringField(TEXT("category"), Payload.Category);
    PayloadObject->SetObjectField(TEXT("context"), BuildArgumentsObject(Payload.Context));
    return EmitJsonMessage(TEXT("publish"), PayloadObject, TopicLoggerEvents, FString(), false, Payload.Timestamp);
}

bool UQuestSupervisorSubsystem::SendExperienceMarker(const FQuestSupervisorExperienceMarker& Marker)
{
    const FQuestSupervisorExperienceMarker Payload = BuildExperienceMarkerPayload(Marker);
    if (Payload.DeviceId.IsEmpty() || Payload.MarkerId.IsEmpty() || Payload.Label.IsEmpty())
    {
        return false;
    }

    TSharedPtr<FJsonObject> PayloadObject = MakeShared<FJsonObject>();
    PayloadObject->SetStringField(TEXT("deviceId"), Payload.DeviceId);
    PayloadObject->SetStringField(TEXT("markerId"), Payload.MarkerId);
    PayloadObject->SetStringField(TEXT("commandId"), Payload.CommandId);
    PayloadObject->SetStringField(TEXT("label"), Payload.Label);
    PayloadObject->SetStringField(TEXT("source"), Payload.Source);
    if (!Payload.Note.IsEmpty())
    {
        PayloadObject->SetStringField(TEXT("note"), Payload.Note);
    }
    if (!Payload.Reason.IsEmpty())
    {
        PayloadObject->SetStringField(TEXT("reason"), Payload.Reason);
    }
    return EmitJsonMessage(TEXT("publish"), PayloadObject, TopicExperienceMarker, FString(), false, Payload.Timestamp);
}

bool UQuestSupervisorSubsystem::SendExperienceLifecycleEvent(const FQuestSupervisorExperienceLifecycleEvent& Event)
{
    const FQuestSupervisorExperienceLifecycleEvent Payload = BuildExperienceLifecyclePayload(Event);
    if (Payload.DeviceId.IsEmpty() || Payload.RunId.IsEmpty() || Payload.Event.IsEmpty())
    {
        return false;
    }
    if (!Payload.Event.Equals(TEXT("started"), ESearchCase::IgnoreCase) && !Payload.Event.Equals(TEXT("ended"), ESearchCase::IgnoreCase))
    {
        return false;
    }

    TSharedPtr<FJsonObject> PayloadObject = MakeShared<FJsonObject>();
    PayloadObject->SetStringField(TEXT("deviceId"), Payload.DeviceId);
    PayloadObject->SetStringField(TEXT("event"), Payload.Event.ToLower());
    PayloadObject->SetStringField(TEXT("runId"), Payload.RunId);
    PayloadObject->SetStringField(TEXT("source"), Payload.Source);
    if (!Payload.Label.IsEmpty())
    {
        PayloadObject->SetStringField(TEXT("label"), Payload.Label);
    }
    if (!Payload.Reason.IsEmpty())
    {
        PayloadObject->SetStringField(TEXT("reason"), Payload.Reason);
    }

    const bool bSent = EmitJsonMessage(TEXT("publish"), PayloadObject, TopicExperienceLifecycle, FString(), false, Payload.Timestamp);
    if (bSent)
    {
        if (Payload.Event.Equals(TEXT("started"), ESearchCase::IgnoreCase))
        {
            ActiveExperienceRunId = Payload.RunId;
        }
        else if (Payload.Event.Equals(TEXT("ended"), ESearchCase::IgnoreCase) && ActiveExperienceRunId == Payload.RunId)
        {
            ActiveExperienceRunId.Empty();
        }
    }
    return bSent;
}

bool UQuestSupervisorSubsystem::StartExperience(const FString& Label, const FString& Reason)
{
    FQuestSupervisorExperienceLifecycleEvent Event;
    Event.Event = TEXT("started");
    Event.Label = Label;
    Event.Reason = Reason;
    Event.Source = TEXT("xr");
    return SendExperienceLifecycleEvent(Event);
}

bool UQuestSupervisorSubsystem::EndExperience(const FString& Reason)
{
    if (ActiveExperienceRunId.IsEmpty())
    {
        return false;
    }

    FQuestSupervisorExperienceLifecycleEvent Event;
    Event.Event = TEXT("ended");
    Event.RunId = ActiveExperienceRunId;
    Event.Reason = Reason;
    Event.Source = TEXT("xr");
    return SendExperienceLifecycleEvent(Event);
}

bool UQuestSupervisorSubsystem::SendCommandAck(const FQuestSupervisorCommandAck& Ack)
{
    const FQuestSupervisorCommandAck Payload = BuildCommandAckPayload(Ack);
    if (Payload.DeviceId.IsEmpty() || Payload.CommandId.IsEmpty())
    {
        return false;
    }

    TSharedPtr<FJsonObject> PayloadObject = MakeShared<FJsonObject>();
    PayloadObject->SetStringField(TEXT("messageId"), Payload.CommandId);
    PayloadObject->SetStringField(TEXT("status"), Payload.Status);
    PayloadObject->SetStringField(TEXT("detail"), Payload.Message);
    return EmitJsonMessage(TEXT("ack"), PayloadObject, FString(), Payload.CommandId, false, Payload.ReceivedAt);
}

bool UQuestSupervisorSubsystem::AcceptCommand(const FString& CommandId, const FString& Message)
{
    FQuestSupervisorCommandAck Ack;
    Ack.CommandId = CommandId;
    Ack.DeviceId = CachedRegistration.DeviceId;
    Ack.Status = TEXT("accepted");
    Ack.Message = Message.IsEmpty() ? TEXT("Command accepted by game logic.") : Message;
    return SendCommandAck(Ack);
}

bool UQuestSupervisorSubsystem::RejectCommand(const FString& CommandId, const FString& Reason)
{
    FQuestSupervisorCommandAck Ack;
    Ack.CommandId = CommandId;
    Ack.DeviceId = CachedRegistration.DeviceId;
    Ack.Status = TEXT("rejected");
    Ack.Message = Reason.IsEmpty() ? TEXT("Command rejected by game logic.") : Reason;
    return SendCommandAck(Ack);
}

bool UQuestSupervisorSubsystem::HandleIncomingMessageJson(const FString& RawJson)
{
    return ParseAndDispatchCommand(RawJson);
}

EQuestSupervisorTransportState UQuestSupervisorSubsystem::GetTransportState() const
{
    return TransportState;
}

FString UQuestSupervisorSubsystem::GetSupervisorEndpoint() const
{
    return SupervisorEndpoint;
}

TArray<FString> UQuestSupervisorSubsystem::GetQueuedMessages() const
{
    return OutgoingMessages;
}

bool UQuestSupervisorSubsystem::IsDeviceRegistered() const
{
    return bIsRegistered;
}

bool UQuestSupervisorSubsystem::IsSupervisorEnabled() const
{
    return RuntimeConfig.bSupervisorEnabled;
}

bool UQuestSupervisorSubsystem::IsAutoAckCommandsEnabled() const
{
    return RuntimeConfig.bAutoAckCommands;
}

FString UQuestSupervisorSubsystem::GetLastHeartbeatTimestamp() const
{
    return LastHeartbeatTimestamp;
}

FString UQuestSupervisorSubsystem::GetLastRegistrationTimestamp() const
{
    return LastRegistrationTimestamp;
}

FString UQuestSupervisorSubsystem::GetLastConnectedTimestamp() const
{
    return LastConnectedTimestamp;
}

FString UQuestSupervisorSubsystem::GetLastDisconnectedTimestamp() const
{
    return LastDisconnectedTimestamp;
}

FString UQuestSupervisorSubsystem::GetLastConnectionError() const
{
    return LastConnectionError;
}

int32 UQuestSupervisorSubsystem::GetReconnectAttempts() const
{
    return ReconnectAttempts;
}

bool UQuestSupervisorSubsystem::ConnectTransport()
{
    if (!RuntimeConfig.bSupervisorEnabled)
    {
        LastConnectionError = TEXT("QuestSupervisor is disabled by runtime config.");
        UpdateTransportState(EQuestSupervisorTransportState::Disconnected);
        return false;
    }

    if (SupervisorEndpoint.IsEmpty())
    {
        return false;
    }

    if (ActiveSocket.IsValid())
    {
        if (CanUseSocket() || TransportState == EQuestSupervisorTransportState::Connecting)
        {
            return true;
        }

        ActiveSocket.Reset();
    }

    StopReconnectLoop();
    UpdateTransportState(EQuestSupervisorTransportState::Connecting);
    bIntentionalDisconnect = false;

    const FString SocketUrl = BuildSocketUrl();
    UE_LOG(LogQuestSupervisor, Log, TEXT("QuestSupervisor attempting WebSocket connection to %s"), *BuildSafeEndpointForLog());

    FModuleManager::LoadModuleChecked<FWebSocketsModule>(TEXT("WebSockets"));
    ActiveSocket = FWebSocketsModule::Get().CreateWebSocket(SocketUrl);
    if (!ActiveSocket.IsValid())
    {
        LastConnectionError = TEXT("Unable to create WebSocket transport.");
        UpdateTransportState(EQuestSupervisorTransportState::Error);
        return false;
    }

    ActiveSocket->OnConnected().AddUObject(this, &UQuestSupervisorSubsystem::HandleSocketConnected);
    ActiveSocket->OnClosed().AddUObject(this, &UQuestSupervisorSubsystem::HandleSocketClosed);
    ActiveSocket->OnConnectionError().AddUObject(this, &UQuestSupervisorSubsystem::HandleSocketConnectionError);
    ActiveSocket->OnMessage().AddUObject(this, &UQuestSupervisorSubsystem::HandleSocketMessage);
    ActiveSocket->Connect();
    return true;
}

void UQuestSupervisorSubsystem::DisconnectTransport(bool bIntentional)
{
    bIntentionalDisconnect = bIntentional;
    if (bIntentional)
    {
        ReconnectAttempts = 0;
    }

    StopHeartbeatLoop();
    StopReconnectLoop();
    bIsRegistered = false;

    if (ActiveSocket.IsValid())
    {
        TSharedPtr<IWebSocket> SocketToClose = ActiveSocket;
        ActiveSocket.Reset();
        SocketToClose->Close();
    }

    UpdateTransportState(EQuestSupervisorTransportState::Disconnected);
}

FString UQuestSupervisorSubsystem::BuildSocketUrl() const
{
    FString SocketUrl = SupervisorEndpoint;
    const FString Token = RuntimeConfig.AuthToken.TrimStartAndEnd();
    if (Token.IsEmpty())
    {
        return SocketUrl;
    }

    SocketUrl += SocketUrl.Contains(TEXT("?")) ? TEXT("&token=") : TEXT("?token=");
    SocketUrl += FGenericPlatformHttp::UrlEncode(Token);
    return SocketUrl;
}

FString UQuestSupervisorSubsystem::BuildSafeEndpointForLog() const
{
    if (RuntimeConfig.AuthToken.TrimStartAndEnd().IsEmpty())
    {
        return SupervisorEndpoint;
    }

    return SupervisorEndpoint.Contains(TEXT("?"))
        ? FString::Printf(TEXT("%s&token=<redacted>"), *SupervisorEndpoint)
        : FString::Printf(TEXT("%s?token=<redacted>"), *SupervisorEndpoint);
}

bool UQuestSupervisorSubsystem::EmitJsonMessage(
    const FString& Type,
    const TSharedPtr<FJsonObject>& PayloadObject,
    const FString& Topic,
    const FString& CorrelationId,
    bool bRequiresAck,
    const FString& CollectedAt,
    int64 SessionTimeMs)
{
    if (!PayloadObject.IsValid())
    {
        return false;
    }

    TSharedPtr<FJsonObject> Envelope = MakeShared<FJsonObject>();
    Envelope->SetNumberField(TEXT("version"), 1);
    Envelope->SetStringField(TEXT("id"), FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphensLower));
    Envelope->SetStringField(TEXT("type"), Type);
    if (!Topic.IsEmpty())
    {
        Envelope->SetStringField(TEXT("topic"), Topic);
    }
    Envelope->SetStringField(TEXT("clientId"), CachedRegistration.DeviceId);
    if (!CorrelationId.IsEmpty())
    {
        Envelope->SetStringField(TEXT("correlationId"), CorrelationId);
    }
    Envelope->SetBoolField(TEXT("requiresAck"), bRequiresAck);
    if (!CollectedAt.IsEmpty())
    {
        Envelope->SetStringField(TEXT("collectedAt"), CollectedAt);
    }
    if (SessionTimeMs >= 0)
    {
        Envelope->SetNumberField(TEXT("sessionTimeMs"), static_cast<double>(SessionTimeMs));
    }
    Envelope->SetObjectField(TEXT("payload"), PayloadObject);

    FString OutJson;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&OutJson);
    if (!FJsonSerializer::Serialize(Envelope.ToSharedRef(), Writer))
    {
        return false;
    }

    if (CanUseSocket())
    {
        ActiveSocket->Send(OutJson);
        return true;
    }

    QueueOutgoingMessage(OutJson);
    if (!SupervisorEndpoint.IsEmpty())
    {
        ConnectTransport();
    }

    return true;
}

bool UQuestSupervisorSubsystem::SendRegistrationMessage(bool bRefreshTimestamp)
{
    if (!bHasRegistration || CachedRegistration.DeviceId.IsEmpty())
    {
        return false;
    }

    FQuestSupervisorDeviceRegistration Payload = CachedRegistration;
    if (bRefreshTimestamp || Payload.Timestamp.IsEmpty())
    {
        Payload.Timestamp = MakeIsoTimestamp();
    }

    TSharedPtr<FJsonObject> PayloadObject = MakeShared<FJsonObject>();
    PayloadObject->SetStringField(TEXT("clientId"), Payload.DeviceId);
    PayloadObject->SetStringField(TEXT("role"), TEXT("unreal"));
    PayloadObject->SetArrayField(TEXT("capabilities"), BuildCapabilityList(Payload.Capabilities));
    PayloadObject->SetStringField(TEXT("deviceLabel"), Payload.DeviceLabel);
    PayloadObject->SetStringField(TEXT("appId"), Payload.AppId);
    PayloadObject->SetStringField(TEXT("appVersion"), Payload.AppVersion);
    PayloadObject->SetStringField(TEXT("headsetModel"), Payload.HeadsetModel);
    PayloadObject->SetStringField(TEXT("sessionId"), Payload.SessionId);

    LastRegistrationTimestamp = Payload.Timestamp;
    CachedRegistration = Payload;
    bIsRegistered = EmitJsonMessage(TEXT("hello"), PayloadObject, FString(), FString(), false, Payload.Timestamp);
    return bIsRegistered;
}

bool UQuestSupervisorSubsystem::SendSubscribeMessage()
{
    if (!bHasRegistration || CachedRegistration.DeviceId.IsEmpty())
    {
        return false;
    }

    TArray<TSharedPtr<FJsonValue>> Topics;
    Topics.Add(MakeShared<FJsonValueString>(TopicUnrealCommands));

    TSharedPtr<FJsonObject> PayloadObject = MakeShared<FJsonObject>();
    PayloadObject->SetArrayField(TEXT("topics"), Topics);
    return EmitJsonMessage(TEXT("subscribe"), PayloadObject);
}

bool UQuestSupervisorSubsystem::ParseAndDispatchCommand(const FString& RawJson)
{
    TSharedPtr<FJsonObject> RootObject;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(RawJson);
    if (!FJsonSerializer::Deserialize(Reader, RootObject) || !RootObject.IsValid())
    {
        return false;
    }

    const TSharedPtr<FJsonValue>* TypeValue = RootObject->Values.Find(TEXT("type"));
    FString MessageType;
    if (!TypeValue || !TypeValue->IsValid())
    {
        return false;
    }
    MessageType = (*TypeValue)->AsString();

    FString Topic;
    RootObject->TryGetStringField(TEXT("topic"), Topic);
    if (MessageType != TEXT("publish") || Topic != TopicUnrealCommands)
    {
        return false;
    }

    const TSharedPtr<FJsonValue>* PayloadValue = RootObject->Values.Find(TEXT("payload"));
    if (!PayloadValue || !PayloadValue->IsValid())
    {
        return false;
    }

    const TSharedPtr<FJsonObject> PayloadObject = (*PayloadValue)->AsObject();
    if (!PayloadObject.IsValid())
    {
        return false;
    }

    FString MessageId;
    RootObject->TryGetStringField(TEXT("id"), MessageId);
    if (!MessageId.IsEmpty() && !PayloadObject->HasField(TEXT("commandId")))
    {
        PayloadObject->SetStringField(TEXT("id"), MessageId);
    }

    FQuestSupervisorCommandRequest Command;
    if (!ExtractCommandPayload(PayloadObject, Command))
    {
        return false;
    }

    UpdateTransportState(EQuestSupervisorTransportState::Connected);

    if (RuntimeConfig.bAutoAckCommands)
    {
        FQuestSupervisorCommandAck Ack;
        Ack.CommandId = Command.CommandId;
        Ack.DeviceId = CachedRegistration.DeviceId;
        Ack.ReceivedAt = MakeIsoTimestamp();
        Ack.Status = TEXT("accepted");
        Ack.Message = FString::Printf(TEXT("Command '%s' received by QuestSupervisor."), *Command.Action);
        const bool bAckSent = SendCommandAck(Ack);
        UE_LOG(
            LogQuestSupervisor,
            Log,
            TEXT("QuestSupervisor command ack %s for command %s with status %s"),
            bAckSent ? TEXT("sent") : TEXT("failed"),
            *Ack.CommandId,
            *Ack.Status);
    }
    else
    {
        UE_LOG(LogQuestSupervisor, Log, TEXT("QuestSupervisor command %s received; waiting for game-provided ACK."), *Command.CommandId);
    }

    SendSystemLog(FString::Printf(TEXT("Received command '%s'."), *Command.Action), EQuestSupervisorLogLevel::Info, TEXT("command"));
    OnCommandReceived.Broadcast(Command);
    return true;
}

void UQuestSupervisorSubsystem::QueueOutgoingMessage(const FString& MessageJson)
{
    if (OutgoingMessages.Num() >= MaxQueuedMessages)
    {
        OutgoingMessages.RemoveAt(0);
    }

    OutgoingMessages.Add(MessageJson);
}

void UQuestSupervisorSubsystem::FlushOutgoingMessages()
{
    if (!CanUseSocket() || OutgoingMessages.Num() == 0)
    {
        return;
    }

    for (const FString& Message : OutgoingMessages)
    {
        ActiveSocket->Send(Message);
    }

    OutgoingMessages.Reset();
}

void UQuestSupervisorSubsystem::HandleSocketConnected()
{
    LastConnectionError.Reset();
    UpdateTransportState(EQuestSupervisorTransportState::Connected);
    ReconnectAttempts = 0;
    UE_LOG(LogQuestSupervisor, Log, TEXT("QuestSupervisor WebSocket connected to %s"), *BuildSafeEndpointForLog());

    if (bHasRegistration)
    {
        SendRegistrationMessage(true);
        SendSubscribeMessage();

        if (bHasHeartbeat)
        {
            SendHeartbeat(CachedHeartbeat);
        }

        SendSystemLog(TEXT("Device transport connected."), EQuestSupervisorLogLevel::Info, TEXT("transport"));
    }

    FlushOutgoingMessages();
    StartHeartbeatLoop();
}

void UQuestSupervisorSubsystem::HandleSocketClosed(int32 StatusCode, const FString& Reason, bool bWasClean)
{
    UE_LOG(
        LogQuestSupervisor,
        Warning,
        TEXT("QuestSupervisor WebSocket closed. StatusCode=%d WasClean=%s Reason=%s"),
        StatusCode,
        bWasClean ? TEXT("true") : TEXT("false"),
        Reason.IsEmpty() ? TEXT("<empty>") : *Reason);

    ActiveSocket.Reset();
    StopHeartbeatLoop();
    bIsRegistered = false;

    if (bIntentionalDisconnect || SupervisorEndpoint.IsEmpty())
    {
        UpdateTransportState(EQuestSupervisorTransportState::Disconnected);
        return;
    }

    LastConnectionError = Reason.IsEmpty()
        ? FString::Printf(TEXT("WebSocket closed with status %d."), StatusCode)
        : Reason;

    UpdateTransportState(EQuestSupervisorTransportState::Connecting);
    ScheduleReconnect();
}

void UQuestSupervisorSubsystem::HandleSocketConnectionError(const FString& Error)
{
    UE_LOG(
        LogQuestSupervisor,
        Error,
        TEXT("QuestSupervisor WebSocket connection error for %s: %s"),
        *BuildSafeEndpointForLog(),
        Error.IsEmpty() ? TEXT("<empty>") : *Error);

    ActiveSocket.Reset();
    StopHeartbeatLoop();
    bIsRegistered = false;
    LastConnectionError = Error;
    UpdateTransportState(EQuestSupervisorTransportState::Error);

    if (!bIntentionalDisconnect && !SupervisorEndpoint.IsEmpty())
    {
        ScheduleReconnect();
    }
}

void UQuestSupervisorSubsystem::HandleSocketMessage(const FString& Message)
{
    HandleIncomingMessageJson(Message);
}

void UQuestSupervisorSubsystem::StartHeartbeatLoop()
{
    if (HeartbeatTickerHandle.IsValid() || !bHasRegistration)
    {
        return;
    }

    HeartbeatTickerHandle = FTSTicker::GetCoreTicker().AddTicker(
        FTickerDelegate::CreateUObject(this, &UQuestSupervisorSubsystem::HandleHeartbeatTick),
        HeartbeatIntervalSeconds);
}

void UQuestSupervisorSubsystem::StopHeartbeatLoop()
{
    if (!HeartbeatTickerHandle.IsValid())
    {
        return;
    }

    FTSTicker::GetCoreTicker().RemoveTicker(HeartbeatTickerHandle);
    HeartbeatTickerHandle.Reset();
}

bool UQuestSupervisorSubsystem::HandleHeartbeatTick(float DeltaTime)
{
    if (!bHasRegistration || !CanUseSocket())
    {
        return true;
    }

    const FQuestSupervisorHeartbeat Heartbeat = BuildHeartbeatPayload(nullptr);
    SendHeartbeat(Heartbeat);
    return true;
}

void UQuestSupervisorSubsystem::ScheduleReconnect()
{
    if (ReconnectTickerHandle.IsValid() || SupervisorEndpoint.IsEmpty())
    {
        return;
    }

    const float DelaySeconds = GetNextReconnectDelaySeconds();
    ++ReconnectAttempts;
    UE_LOG(
        LogQuestSupervisor,
        Warning,
        TEXT("QuestSupervisor scheduling reconnect attempt %d in %.2fs."),
        ReconnectAttempts,
        DelaySeconds);

    ReconnectTickerHandle = FTSTicker::GetCoreTicker().AddTicker(
        FTickerDelegate::CreateUObject(this, &UQuestSupervisorSubsystem::HandleReconnectTick),
        DelaySeconds);
}

void UQuestSupervisorSubsystem::StopReconnectLoop()
{
    if (!ReconnectTickerHandle.IsValid())
    {
        return;
    }

    FTSTicker::GetCoreTicker().RemoveTicker(ReconnectTickerHandle);
    ReconnectTickerHandle.Reset();
}

bool UQuestSupervisorSubsystem::HandleReconnectTick(float DeltaTime)
{
    ReconnectTickerHandle.Reset();

    if (SupervisorEndpoint.IsEmpty() || bIntentionalDisconnect)
    {
        return false;
    }

    ConnectTransport();
    return false;
}

float UQuestSupervisorSubsystem::GetNextReconnectDelaySeconds() const
{
    const int32 BackoffStep = FMath::Max(0, ReconnectAttempts);
    const float Multiplier = FMath::Pow(2.0f, static_cast<float>(BackoffStep));
    return FMath::Clamp(InitialReconnectDelaySeconds * Multiplier, InitialReconnectDelaySeconds, MaxReconnectDelaySeconds);
}

void UQuestSupervisorSubsystem::UpdateTransportState(EQuestSupervisorTransportState NewState)
{
    if (TransportState == NewState)
    {
        return;
    }

    const EQuestSupervisorTransportState PreviousState = TransportState;
    TransportState = NewState;

    if (NewState == EQuestSupervisorTransportState::Connected)
    {
        LastConnectedTimestamp = MakeIsoTimestamp();
    }
    else if (PreviousState == EQuestSupervisorTransportState::Connected)
    {
        LastDisconnectedTimestamp = MakeIsoTimestamp();
    }

    OnTransportStateChanged.Broadcast(PreviousState, NewState);
}

bool UQuestSupervisorSubsystem::CanUseSocket() const
{
    return ActiveSocket.IsValid() && ActiveSocket->IsConnected();
}

FQuestSupervisorHeartbeat UQuestSupervisorSubsystem::BuildHeartbeatPayload(const FQuestSupervisorHeartbeat* SourceHeartbeat) const
{
    FQuestSupervisorHeartbeat Payload = SourceHeartbeat ? *SourceHeartbeat : CachedHeartbeat;
    if (Payload.DeviceId.IsEmpty())
    {
        Payload.DeviceId = CachedRegistration.DeviceId;
    }

    if (Payload.Timestamp.IsEmpty())
    {
        Payload.Timestamp = MakeIsoTimestamp();
    }
    else if (!SourceHeartbeat)
    {
        Payload.Timestamp = MakeIsoTimestamp();
    }

    RefreshAutomaticTelemetry(Payload);
    return Payload;
}

void UQuestSupervisorSubsystem::RefreshAutomaticTelemetry(FQuestSupervisorHeartbeat& Payload) const
{
    Payload.Telemetry.SessionElapsedSec = GetSessionElapsedSeconds();
    Payload.Telemetry.FPS = GetCurrentFramesPerSecond();
    Payload.Telemetry.MemoryMb = GetUsedMemoryMegabytes();

    FQuestSupervisorBatteryTelemetry BatteryTelemetry;
    if (AndroidBridge.ReadBatteryTelemetry(BatteryTelemetry))
    {
        if (BatteryTelemetry.bHasBatteryPct)
        {
            Payload.Telemetry.BatteryPct = BatteryTelemetry.BatteryPct;
        }

        if (BatteryTelemetry.bHasTemperatureC)
        {
            Payload.Telemetry.TemperatureC = BatteryTelemetry.TemperatureC;
        }
    }
}

float UQuestSupervisorSubsystem::GetSessionElapsedSeconds() const
{
    if (SessionStartSeconds <= 0.0)
    {
        return 0.0f;
    }

    return static_cast<float>(FMath::Max(0.0, FPlatformTime::Seconds() - SessionStartSeconds));
}

float UQuestSupervisorSubsystem::GetCurrentFramesPerSecond() const
{
    const float DeltaTime = FApp::GetDeltaTime();
    if (DeltaTime <= KINDA_SMALL_NUMBER)
    {
        return 0.0f;
    }

    return 1.0f / DeltaTime;
}

float UQuestSupervisorSubsystem::GetUsedMemoryMegabytes() const
{
    const FPlatformMemoryStats MemoryStats = FPlatformMemory::GetStats();
    if (MemoryStats.UsedPhysical <= 0)
    {
        return 0.0f;
    }

    return static_cast<float>(MemoryStats.UsedPhysical / (1024.0 * 1024.0));
}

FQuestSupervisorLogEntry UQuestSupervisorSubsystem::BuildLogPayload(const FQuestSupervisorLogEntry& Entry) const
{
    FQuestSupervisorLogEntry Payload = Entry;
    if (Payload.DeviceId.IsEmpty())
    {
        Payload.DeviceId = CachedRegistration.DeviceId;
    }

    if (Payload.Timestamp.IsEmpty())
    {
        Payload.Timestamp = MakeIsoTimestamp();
    }

    return Payload;
}

FQuestSupervisorExperienceMarker UQuestSupervisorSubsystem::BuildExperienceMarkerPayload(const FQuestSupervisorExperienceMarker& Marker) const
{
    FQuestSupervisorExperienceMarker Payload = Marker;
    if (Payload.DeviceId.IsEmpty())
    {
        Payload.DeviceId = CachedRegistration.DeviceId;
    }

    if (Payload.Timestamp.IsEmpty())
    {
        Payload.Timestamp = MakeIsoTimestamp();
    }

    if (Payload.MarkerId.IsEmpty())
    {
        Payload.MarkerId = Payload.CommandId.IsEmpty()
            ? FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphensLower)
            : Payload.CommandId;
    }

    if (Payload.Source.IsEmpty())
    {
        Payload.Source = TEXT("xr");
    }

    Payload.Label.TrimStartAndEndInline();
    Payload.Note.TrimStartAndEndInline();
    Payload.Reason.TrimStartAndEndInline();
    return Payload;
}

FQuestSupervisorExperienceLifecycleEvent UQuestSupervisorSubsystem::BuildExperienceLifecyclePayload(const FQuestSupervisorExperienceLifecycleEvent& Event) const
{
    FQuestSupervisorExperienceLifecycleEvent Payload = Event;
    if (Payload.DeviceId.IsEmpty())
    {
        Payload.DeviceId = CachedRegistration.DeviceId;
    }

    if (Payload.Timestamp.IsEmpty())
    {
        Payload.Timestamp = MakeIsoTimestamp();
    }

    Payload.Event.TrimStartAndEndInline();
    Payload.Event = Payload.Event.ToLower();
    Payload.Label.TrimStartAndEndInline();
    Payload.Reason.TrimStartAndEndInline();
    Payload.Source.TrimStartAndEndInline();
    if (Payload.Source.IsEmpty())
    {
        Payload.Source = TEXT("xr");
    }

    if (Payload.RunId.IsEmpty())
    {
        if (Payload.Event.Equals(TEXT("ended"), ESearchCase::IgnoreCase) && !ActiveExperienceRunId.IsEmpty())
        {
            Payload.RunId = ActiveExperienceRunId;
        }
        else
        {
            Payload.RunId = FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphensLower);
        }
    }

    return Payload;
}

FQuestSupervisorCommandAck UQuestSupervisorSubsystem::BuildCommandAckPayload(const FQuestSupervisorCommandAck& Ack) const
{
    FQuestSupervisorCommandAck Payload = Ack;
    if (Payload.DeviceId.IsEmpty())
    {
        Payload.DeviceId = CachedRegistration.DeviceId;
    }

    if (Payload.ReceivedAt.IsEmpty())
    {
        Payload.ReceivedAt = MakeIsoTimestamp();
    }

    return Payload;
}

FString UQuestSupervisorSubsystem::MakeIsoTimestamp() const
{
    return FDateTime::UtcNow().ToIso8601();
}

void UQuestSupervisorSubsystem::SendSystemLog(const FString& Message, EQuestSupervisorLogLevel Level, const FString& Category)
{
    if (!bHasRegistration)
    {
        return;
    }

    FQuestSupervisorLogEntry Entry;
    Entry.DeviceId = CachedRegistration.DeviceId;
    Entry.Level = Level;
    Entry.Message = Message;
    Entry.Category = Category;
    SendLogEntry(Entry);
}
