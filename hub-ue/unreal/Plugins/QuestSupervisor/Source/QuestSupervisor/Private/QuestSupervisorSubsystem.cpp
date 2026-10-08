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
#include "QuestSupervisorTelemetryState.h"
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
    const TCHAR* TopicSystemPing = TEXT("system.ping");
    const TCHAR* TopicSystemPong = TEXT("system.pong");
    constexpr float CommunicationProbeTickSeconds = 0.25f;

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

    FQuestSupervisorTelemetryMetricAvailability AvailableMetric(const FString& Source)
    {
        FQuestSupervisorTelemetryMetricAvailability Availability;
        Availability.Status = TEXT("available");
        Availability.Source = Source;
        return Availability;
    }

    FQuestSupervisorTelemetryMetricAvailability UnavailableMetric(const FString& Reason)
    {
        FQuestSupervisorTelemetryMetricAvailability Availability;
        Availability.Status = TEXT("unavailable");
        Availability.Reason = Reason;
        return Availability;
    }

    FString GetTelemetryPlatform()
    {
#if PLATFORM_ANDROID
        return TEXT("android");
#elif PLATFORM_WINDOWS
        return TEXT("windows");
#elif PLATFORM_MAC
        return TEXT("mac");
#elif PLATFORM_LINUX
        return TEXT("linux");
#else
        return TEXT("unknown");
#endif
    }

    FString GetTelemetryExecutionMode()
    {
#if WITH_EDITOR
        return GIsEditor ? TEXT("editor") : TEXT("packaged");
#else
        return TEXT("packaged");
#endif
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

    TelemetryState = MakeShared<FQuestSupervisorTelemetryState>();
    TelemetryState->Reset();
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
    PendingExperienceRunId.Reset();
    PendingExperienceEvent.Reset();
    PendingExperienceMessageId.Reset();
    SessionStartSeconds = 0.0;
    NextProbeSendSeconds = 0.0;
    StartTelemetrySampling();

    if (RuntimeConfig.bAutoConnectOnStartup)
    {
        StartSupervisor();
    }
}

void UQuestSupervisorSubsystem::Deinitialize()
{
    StopTelemetrySampling();
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
    PendingExperienceRunId.Reset();
    PendingExperienceEvent.Reset();
    PendingExperienceMessageId.Reset();
    SessionStartSeconds = 0.0;
    NextProbeSendSeconds = 0.0;
    if (TelemetryState.IsValid())
    {
        TelemetryState->Reset();
    }
    TelemetryState.Reset();

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
        if (ActiveSocket.IsValid() || ReconnectTickerHandle.IsValid())
        {
            DisconnectTransport(true);
            SupervisorEndpoint.Reset();
            ConnectionAuthToken.Reset();
            bHasRegistration = false;
        }
        return false;
    }

    const FString RequestedEndpoint = NormalizeSupervisorEndpoint(RuntimeConfig.SupervisorEndpoint);
    const FString RequestedAuthToken = RuntimeConfig.AuthToken.TrimStartAndEnd();
    const FQuestSupervisorDeviceRegistration Registration = BuildConfiguredRegistration();
    const FQuestSupervisorDeviceCapabilities& RequestedCapabilities = Registration.Capabilities;
    const FQuestSupervisorDeviceCapabilities& CachedCapabilities = CachedRegistration.Capabilities;
    const bool bSameRegistrationConfig =
        CachedRegistration.DeviceId == Registration.DeviceId &&
        CachedRegistration.DeviceLabel == Registration.DeviceLabel &&
        CachedRegistration.AppId == Registration.AppId &&
        CachedRegistration.AppVersion == Registration.AppVersion &&
        CachedRegistration.HeadsetModel == Registration.HeadsetModel &&
        CachedCapabilities.bSceneLoading == RequestedCapabilities.bSceneLoading &&
        CachedCapabilities.bTelemetry == RequestedCapabilities.bTelemetry &&
        CachedCapabilities.bCommandExecution == RequestedCapabilities.bCommandExecution &&
        CachedCapabilities.bLogs == RequestedCapabilities.bLogs &&
        CachedCapabilities.bFutureStreaming == RequestedCapabilities.bFutureStreaming;
    const bool bSameConnectionConfig =
        RequestedEndpoint == SupervisorEndpoint &&
        RequestedAuthToken == ConnectionAuthToken &&
        bSameRegistrationConfig;
    const bool bTransportConfigChanged =
        RequestedEndpoint != SupervisorEndpoint ||
        RequestedAuthToken != ConnectionAuthToken;
    const bool bRegistrationConfigChanged =
        bHasRegistration && !bSameRegistrationConfig;
    const bool bSameMessageRoute =
        RequestedEndpoint == SupervisorEndpoint &&
        CachedRegistration.DeviceId == Registration.DeviceId;
    const bool bTransportActiveOrReconnecting =
        (ActiveSocket.IsValid() &&
            (TransportState == EQuestSupervisorTransportState::Connecting || CanUseSocket())) ||
        (!bIntentionalDisconnect && ReconnectTickerHandle.IsValid());

    if (bHasRegistration && bSameConnectionConfig && bTransportActiveOrReconnecting)
    {
        UE_LOG(LogQuestSupervisor, Verbose, TEXT("QuestSupervisor is already starting or connected."));
        return true;
    }

    if (bTransportActiveOrReconnecting &&
        (bTransportConfigChanged || bRegistrationConfigChanged))
    {
        UE_LOG(LogQuestSupervisor, Log, TEXT("QuestSupervisor configuration changed; reconnecting transport."));
        TArray<FString> PreservedOutgoingMessages;
        if (bSameMessageRoute)
        {
            PreservedOutgoingMessages = MoveTemp(OutgoingMessages);
        }
        DisconnectTransport(true, bSameMessageRoute);
        if (bSameMessageRoute)
        {
            PreservedOutgoingMessages.Append(OutgoingMessages);
            OutgoingMessages = MoveTemp(PreservedOutgoingMessages);
        }
        bHasRegistration = false;
    }

    const bool bEndpointConfigured = ConfigureSupervisorEndpoint(RuntimeConfig.SupervisorEndpoint);
    const bool bRegistrationQueued = RegisterDevice(Registration);

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
    const bool bShouldReconcileTransport =
        ActiveSocket.IsValid() ||
        (!bIntentionalDisconnect && ReconnectTickerHandle.IsValid());
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
        return;
    }

    if (bShouldReconcileTransport)
    {
        StartSupervisor();
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
    StartSupervisor();
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
    CachedHeartbeat.DeviceId = CachedRegistration.DeviceId;

    if (!bHasHeartbeat)
    {
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
        SendHeartbeat(BuildHeartbeatPayload(nullptr));
        StartHeartbeatLoop();
        StartCommunicationProbeLoop();
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
    PayloadObject->SetObjectField(
        TEXT("telemetry"),
        QuestSupervisorTelemetryJson::BuildTelemetryObject(Payload.Telemetry));
    return EmitJsonMessage(
        TEXT("publish"),
        PayloadObject,
        TopicUnrealState,
        FString(),
        false,
        Payload.Timestamp,
        static_cast<int64>(Payload.Telemetry.SupervisorUptimeSec * 1000.0f));
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

    FString LifecycleMessageId;
    const bool bSent = EmitJsonMessage(
        TEXT("publish"),
        PayloadObject,
        TopicExperienceLifecycle,
        FString(),
        false,
        Payload.Timestamp,
        -1,
        &LifecycleMessageId);
    if (bSent)
    {
        PendingExperienceRunId = Payload.RunId;
        PendingExperienceEvent = Payload.Event.ToLower();
        PendingExperienceMessageId = LifecycleMessageId;
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
    const FString ActiveRunId = TelemetryState.IsValid() && TelemetryState->Experience.IsActive()
        ? TelemetryState->Experience.GetRunId()
        : PendingExperienceRunId;
    if (ActiveRunId.IsEmpty())
    {
        return false;
    }

    FQuestSupervisorExperienceLifecycleEvent Event;
    Event.Event = TEXT("ended");
    Event.RunId = ActiveRunId;
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
    return ParseAndDispatchIncomingMessage(RawJson);
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

        TSharedPtr<IWebSocket> SocketToClose = ActiveSocket;
        if (TelemetryState.IsValid())
        {
            TelemetryState->Connection.Invalidate();
        }
        ActiveSocket.Reset();
        SocketToClose->Close();
    }

    StopReconnectLoop();
    StopCommunicationProbeLoop();
    UpdateTransportState(EQuestSupervisorTransportState::Connecting);
    bIntentionalDisconnect = false;

    ConnectionAuthToken = RuntimeConfig.AuthToken.TrimStartAndEnd();
    const FString SocketUrl = BuildSocketUrl();
    UE_LOG(LogQuestSupervisor, Log, TEXT("QuestSupervisor attempting WebSocket connection to %s"), *BuildSafeEndpointForLog());

    if (!TelemetryState.IsValid())
    {
        LastConnectionError = TEXT("Telemetry state is unavailable.");
        UpdateTransportState(EQuestSupervisorTransportState::Error);
        return false;
    }

    FModuleManager::LoadModuleChecked<FWebSocketsModule>(TEXT("WebSockets"));
    TSharedPtr<IWebSocket> NewSocket = FWebSocketsModule::Get().CreateWebSocket(SocketUrl);
    if (!NewSocket.IsValid())
    {
        LastConnectionError = TEXT("Unable to create WebSocket transport.");
        UpdateTransportState(EQuestSupervisorTransportState::Error);
        return false;
    }

    const uint64 SocketGeneration = TelemetryState->Connection.BeginConnection();
    const TWeakObjectPtr<UQuestSupervisorSubsystem> WeakThis(this);
    ActiveSocket = NewSocket;
    NewSocket->OnConnected().AddLambda(
        [WeakThis, SocketGeneration]()
        {
            if (WeakThis.IsValid())
            {
                WeakThis->HandleSocketConnected(SocketGeneration);
            }
        });
    NewSocket->OnClosed().AddLambda(
        [WeakThis, SocketGeneration](int32 StatusCode, const FString& Reason, bool bWasClean)
        {
            if (WeakThis.IsValid())
            {
                WeakThis->HandleSocketClosed(SocketGeneration, StatusCode, Reason, bWasClean);
            }
        });
    NewSocket->OnConnectionError().AddLambda(
        [WeakThis, SocketGeneration](const FString& Error)
        {
            if (WeakThis.IsValid())
            {
                WeakThis->HandleSocketConnectionError(SocketGeneration, Error);
            }
        });
    NewSocket->OnMessage().AddLambda(
        [WeakThis, SocketGeneration](const FString& Message)
        {
            if (WeakThis.IsValid())
            {
                WeakThis->HandleSocketMessage(SocketGeneration, Message);
            }
        });
    NewSocket->Connect();
    return true;
}

void UQuestSupervisorSubsystem::DisconnectTransport(
    bool bIntentional,
    bool bPreserveOutgoingMessages)
{
    bIntentionalDisconnect = bIntentional;
    if (bIntentional)
    {
        ReconnectAttempts = 0;
        if (!bPreserveOutgoingMessages)
        {
            OutgoingMessages.Reset();
        }
    }

    StopHeartbeatLoop();
    StopCommunicationProbeLoop();
    StopReconnectLoop();
    bIsRegistered = false;

    if (TelemetryState.IsValid())
    {
        TelemetryState->Connection.Invalidate();
    }

    if (ActiveSocket.IsValid())
    {
        TSharedPtr<IWebSocket> SocketToClose = ActiveSocket;
        ActiveSocket.Reset();
        SocketToClose->Close();
    }

    UpdateTransportState(EQuestSupervisorTransportState::Disconnected);
    if (bIntentional && !bPreserveOutgoingMessages)
    {
        OutgoingMessages.Reset();
    }
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
    int64 SessionTimeMs,
    FString* OutMessageId)
{
    if (!PayloadObject.IsValid())
    {
        return false;
    }

    const FString MessageId = FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphensLower);
    TSharedPtr<FJsonObject> Envelope = MakeShared<FJsonObject>();
    Envelope->SetNumberField(TEXT("version"), 1);
    Envelope->SetStringField(TEXT("id"), MessageId);
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
    if (OutMessageId)
    {
        *OutMessageId = MessageId;
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
    Topics.Add(MakeShared<FJsonValueString>(TopicExperienceLifecycle));

    TSharedPtr<FJsonObject> PayloadObject = MakeShared<FJsonObject>();
    PayloadObject->SetArrayField(TEXT("topics"), Topics);
    return EmitJsonMessage(TEXT("subscribe"), PayloadObject);
}

bool UQuestSupervisorSubsystem::ParseAndDispatchIncomingMessage(const FString& RawJson)
{
    TSharedPtr<FJsonObject> RootObject;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(RawJson);
    if (!FJsonSerializer::Deserialize(Reader, RootObject) || !RootObject.IsValid())
    {
        return false;
    }

    FString MessageType;
    if (!RootObject->TryGetStringField(TEXT("type"), MessageType))
    {
        return false;
    }
    if (MessageType == TEXT("error"))
    {
        return HandleExperienceLifecycleError(RootObject);
    }
    if (MessageType != TEXT("publish"))
    {
        return false;
    }

    FString Topic;
    if (!RootObject->TryGetStringField(TEXT("topic"), Topic))
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

    if (Topic == TopicSystemPong)
    {
        return HandleSystemPong(RootObject, PayloadObject);
    }
    if (Topic == TopicExperienceLifecycle)
    {
        return HandleExperienceLifecycleEcho(PayloadObject);
    }
    if (Topic == TopicUnrealCommands)
    {
        return DispatchCommand(RootObject, PayloadObject);
    }

    return false;
}

bool UQuestSupervisorSubsystem::DispatchCommand(
    const TSharedPtr<FJsonObject>& RootObject,
    const TSharedPtr<FJsonObject>& PayloadObject)
{
    if (!RootObject.IsValid() || !PayloadObject.IsValid())
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

bool UQuestSupervisorSubsystem::HandleSystemPong(
    const TSharedPtr<FJsonObject>& RootObject,
    const TSharedPtr<FJsonObject>& PayloadObject)
{
    if (!TelemetryState.IsValid() || !RootObject.IsValid() || !PayloadObject.IsValid())
    {
        return false;
    }

    FString CorrelationId;
    if (!RootObject->TryGetStringField(TEXT("correlationId"), CorrelationId))
    {
        return false;
    }
    CorrelationId.TrimStartAndEndInline();
    if (CorrelationId.IsEmpty())
    {
        return false;
    }

    TOptional<int64> Sequence;
    double SequenceNumber = 0.0;
    if (PayloadObject->TryGetNumberField(TEXT("sequence"), SequenceNumber) &&
        FMath::IsFinite(SequenceNumber) &&
        SequenceNumber >= 0.0 &&
        FMath::IsNearlyEqual(SequenceNumber, FMath::RoundToDouble(SequenceNumber)))
    {
        Sequence = static_cast<int64>(SequenceNumber);
    }

    const double ReceivedAtSeconds = FPlatformTime::Seconds();
    TelemetryState->Probes.ExpireTimedOut(ReceivedAtSeconds);
    return TelemetryState->Probes.ResolvePong(CorrelationId, Sequence, ReceivedAtSeconds);
}

bool UQuestSupervisorSubsystem::HandleExperienceLifecycleEcho(const TSharedPtr<FJsonObject>& PayloadObject)
{
    if (!TelemetryState.IsValid() || !PayloadObject.IsValid())
    {
        return false;
    }

    FString Event;
    FString RunId;
    if (!PayloadObject->TryGetStringField(TEXT("event"), Event) ||
        !PayloadObject->TryGetStringField(TEXT("runId"), RunId))
    {
        return false;
    }

    Event.TrimStartAndEndInline();
    RunId.TrimStartAndEndInline();
    Event = Event.ToLower();
    if (!TelemetryState->Experience.ObserveLifecycle(Event, RunId, FPlatformTime::Seconds()))
    {
        return false;
    }

    if (PendingExperienceRunId == RunId && PendingExperienceEvent == Event)
    {
        PendingExperienceRunId.Reset();
        PendingExperienceEvent.Reset();
        PendingExperienceMessageId.Reset();
    }
    return true;
}

bool UQuestSupervisorSubsystem::HandleExperienceLifecycleError(const TSharedPtr<FJsonObject>& RootObject)
{
    if (!RootObject.IsValid() || PendingExperienceMessageId.IsEmpty())
    {
        return false;
    }

    FString CorrelationId;
    if (!RootObject->TryGetStringField(TEXT("correlationId"), CorrelationId) ||
        CorrelationId != PendingExperienceMessageId)
    {
        return false;
    }

    const TSharedPtr<FJsonObject>* PayloadObject = nullptr;
    if (!RootObject->TryGetObjectField(TEXT("payload"), PayloadObject) ||
        !PayloadObject ||
        !PayloadObject->IsValid())
    {
        return false;
    }

    FString Code;
    if (!(*PayloadObject)->TryGetStringField(TEXT("code"), Code) ||
        (!Code.Equals(TEXT("lifecycle_conflict"), ESearchCase::CaseSensitive) &&
         !Code.Equals(TEXT("lifecycle_already_ended"), ESearchCase::CaseSensitive)))
    {
        return false;
    }

    UE_LOG(
        LogQuestSupervisor,
        Warning,
        TEXT("Hub rejected lifecycle %s for run %s with %s."),
        *PendingExperienceEvent,
        *PendingExperienceRunId,
        *Code);
    PendingExperienceRunId.Reset();
    PendingExperienceEvent.Reset();
    PendingExperienceMessageId.Reset();
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

void UQuestSupervisorSubsystem::HandleSocketConnected(uint64 SocketGeneration)
{
    if (!TelemetryState.IsValid() || !TelemetryState->Connection.IsCurrent(SocketGeneration))
    {
        return;
    }

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
            SendHeartbeat(BuildHeartbeatPayload(nullptr));
        }

        SendSystemLog(TEXT("Device transport connected."), EQuestSupervisorLogLevel::Info, TEXT("transport"));
    }

    FlushOutgoingMessages();
    StartHeartbeatLoop();
    StartCommunicationProbeLoop();
}

void UQuestSupervisorSubsystem::HandleSocketClosed(
    uint64 SocketGeneration,
    int32 StatusCode,
    const FString& Reason,
    bool bWasClean)
{
    if (!TelemetryState.IsValid() || !TelemetryState->Connection.IsCurrent(SocketGeneration))
    {
        return;
    }

    UE_LOG(
        LogQuestSupervisor,
        Warning,
        TEXT("QuestSupervisor WebSocket closed. StatusCode=%d WasClean=%s Reason=%s"),
        StatusCode,
        bWasClean ? TEXT("true") : TEXT("false"),
        Reason.IsEmpty() ? TEXT("<empty>") : *Reason);

    TelemetryState->Connection.Invalidate();
    ActiveSocket.Reset();
    StopHeartbeatLoop();
    StopCommunicationProbeLoop();
    bIsRegistered = false;

    if (bIntentionalDisconnect || SupervisorEndpoint.IsEmpty())
    {
        UpdateTransportState(EQuestSupervisorTransportState::Disconnected);
        return;
    }

    LastConnectionError = Reason.IsEmpty()
        ? FString::Printf(TEXT("WebSocket closed with status %d."), StatusCode)
        : Reason;

    ScheduleReconnect();
    UpdateTransportState(EQuestSupervisorTransportState::Connecting);
}

void UQuestSupervisorSubsystem::HandleSocketConnectionError(uint64 SocketGeneration, const FString& Error)
{
    if (!TelemetryState.IsValid() || !TelemetryState->Connection.IsCurrent(SocketGeneration))
    {
        return;
    }

    UE_LOG(
        LogQuestSupervisor,
        Error,
        TEXT("QuestSupervisor WebSocket connection error for %s: %s"),
        *BuildSafeEndpointForLog(),
        Error.IsEmpty() ? TEXT("<empty>") : *Error);

    TelemetryState->Connection.Invalidate();
    ActiveSocket.Reset();
    StopHeartbeatLoop();
    StopCommunicationProbeLoop();
    bIsRegistered = false;
    LastConnectionError = Error;

    if (!bIntentionalDisconnect && !SupervisorEndpoint.IsEmpty())
    {
        ScheduleReconnect();
    }
    UpdateTransportState(EQuestSupervisorTransportState::Error);
}

void UQuestSupervisorSubsystem::HandleSocketMessage(uint64 SocketGeneration, const FString& Message)
{
    if (!TelemetryState.IsValid() || !TelemetryState->Connection.IsCurrent(SocketGeneration))
    {
        return;
    }

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

void UQuestSupervisorSubsystem::StartTelemetrySampling()
{
    if (TelemetryTickerHandle.IsValid())
    {
        return;
    }

    TelemetryTickerHandle = FTSTicker::GetCoreTicker().AddTicker(
        FTickerDelegate::CreateUObject(this, &UQuestSupervisorSubsystem::HandleTelemetryTick),
        0.0f);
}

void UQuestSupervisorSubsystem::StopTelemetrySampling()
{
    if (!TelemetryTickerHandle.IsValid())
    {
        return;
    }

    FTSTicker::GetCoreTicker().RemoveTicker(TelemetryTickerHandle);
    TelemetryTickerHandle.Reset();
}

bool UQuestSupervisorSubsystem::HandleTelemetryTick(float DeltaTime)
{
    if (TelemetryState.IsValid())
    {
        TelemetryState->FrameRate.AddFrame(static_cast<double>(DeltaTime));
    }
    return true;
}

void UQuestSupervisorSubsystem::StartCommunicationProbeLoop()
{
    StopCommunicationProbeLoop();
    if (!TelemetryState.IsValid() || !bHasRegistration || !CanUseSocket())
    {
        return;
    }

    const double NowSeconds = FPlatformTime::Seconds();
    SendCommunicationProbe(NowSeconds, false);
    NextProbeSendSeconds = NowSeconds + FQuestSupervisorProbeWindow::SendIntervalSeconds;
    CommunicationProbeTickerHandle = FTSTicker::GetCoreTicker().AddTicker(
        FTickerDelegate::CreateUObject(this, &UQuestSupervisorSubsystem::HandleCommunicationProbeTick),
        CommunicationProbeTickSeconds);
}

void UQuestSupervisorSubsystem::StopCommunicationProbeLoop()
{
    if (CommunicationProbeTickerHandle.IsValid())
    {
        FTSTicker::GetCoreTicker().RemoveTicker(CommunicationProbeTickerHandle);
        CommunicationProbeTickerHandle.Reset();
    }

    NextProbeSendSeconds = 0.0;
    if (TelemetryState.IsValid())
    {
        TelemetryState->Probes.Reset();
    }
}

bool UQuestSupervisorSubsystem::HandleCommunicationProbeTick(float DeltaTime)
{
    if (!TelemetryState.IsValid() || !CanUseSocket())
    {
        return true;
    }

    const double NowSeconds = FPlatformTime::Seconds();
    TelemetryState->Probes.ExpireTimedOut(NowSeconds);
    if (NowSeconds >= NextProbeSendSeconds)
    {
        SendCommunicationProbe(NowSeconds, true);
        NextProbeSendSeconds = NowSeconds + FQuestSupervisorProbeWindow::SendIntervalSeconds;
    }
    return true;
}

bool UQuestSupervisorSubsystem::SendCommunicationProbe(double SentAtSeconds, bool bTrackResult)
{
    if (!TelemetryState.IsValid() || !CanUseSocket() || CachedRegistration.DeviceId.IsEmpty())
    {
        return false;
    }

    const FString MessageId = FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphensLower);
    const int64 Sequence = TelemetryState->Probes.NextSequence();

    TSharedPtr<FJsonObject> PayloadObject = MakeShared<FJsonObject>();
    PayloadObject->SetNumberField(TEXT("sequence"), static_cast<double>(Sequence));

    TSharedPtr<FJsonObject> Envelope = MakeShared<FJsonObject>();
    Envelope->SetNumberField(TEXT("version"), 1);
    Envelope->SetStringField(TEXT("id"), MessageId);
    Envelope->SetStringField(TEXT("type"), TEXT("publish"));
    Envelope->SetStringField(TEXT("topic"), TopicSystemPing);
    Envelope->SetStringField(TEXT("clientId"), CachedRegistration.DeviceId);
    Envelope->SetBoolField(TEXT("requiresAck"), false);
    Envelope->SetObjectField(TEXT("payload"), PayloadObject);

    FString OutJson;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&OutJson);
    if (!FJsonSerializer::Serialize(Envelope.ToSharedRef(), Writer))
    {
        return false;
    }

    if (bTrackResult)
    {
        TelemetryState->Probes.AddPending(MessageId, Sequence, SentAtSeconds);
    }
    ActiveSocket->Send(OutJson);
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

    const bool bExplicitV2Telemetry = SourceHeartbeat &&
        Payload.Telemetry.SchemaVersion >= 2 &&
        Payload.Telemetry.Availability.Num() > 0;
    if (!SourceHeartbeat)
    {
        RefreshAutomaticTelemetry(Payload);
    }
    else if (!bExplicitV2Telemetry)
    {
        // Blueprints created before telemetry V2 remain legacy unless they provide availability explicitly.
        Payload.Telemetry.SchemaVersion = 1;
    }
    return Payload;
}

void UQuestSupervisorSubsystem::RefreshAutomaticTelemetry(FQuestSupervisorHeartbeat& Payload) const
{
    Payload.Telemetry.SchemaVersion = 2;
    Payload.Telemetry.Context.Source = TEXT("quest-supervisor-plugin");
    Payload.Telemetry.Context.Origin = TEXT("automatic");
    Payload.Telemetry.Context.Platform = GetTelemetryPlatform();
    Payload.Telemetry.Context.ExecutionMode = GetTelemetryExecutionMode();
    Payload.Telemetry.Availability.Reset();

    Payload.Telemetry.SupervisorUptimeSec = GetSupervisorUptimeSeconds();
    Payload.Telemetry.SessionElapsedSec = Payload.Telemetry.SupervisorUptimeSec;
    Payload.Telemetry.ExperienceElapsedSec = GetExperienceElapsedSeconds();
    Payload.Telemetry.FPS = GetCurrentFramesPerSecond();
    Payload.Telemetry.LatencyMs = 0.0f;
    Payload.Telemetry.PacketLossPct = 0.0f;
    Payload.Telemetry.BatteryPct = 0.0f;
    Payload.Telemetry.CpuPct = 0.0f;
    Payload.Telemetry.GpuPct = 0.0f;
    Payload.Telemetry.MemoryMb = GetUsedMemoryMegabytes();
    Payload.Telemetry.BatteryTemperatureC = 0.0f;
    Payload.Telemetry.TemperatureC = 0.0f;

    Payload.Telemetry.Availability.Add(
        TEXT("supervisorUptimeSec"),
        SessionStartSeconds > 0.0
            ? AvailableMetric(TEXT("monotonic-clock"))
            : UnavailableMetric(TEXT("warming-up")));
    Payload.Telemetry.Availability.Add(
        TEXT("experienceElapsedSec"),
        TelemetryState.IsValid() && TelemetryState->Experience.IsActive()
            ? AvailableMetric(TEXT("experience-lifecycle"))
            : UnavailableMetric(TEXT("no-active-experience")));
    Payload.Telemetry.Availability.Add(
        TEXT("fps"),
        TelemetryState.IsValid() && TelemetryState->FrameRate.HasSample()
            ? AvailableMetric(TEXT("engine-frame-window"))
            : UnavailableMetric(TEXT("warming-up")));

    const bool bHasRtt = TelemetryState.IsValid() && TelemetryState->Probes.HasSuccessfulSample();
    if (bHasRtt)
    {
        Payload.Telemetry.LatencyMs = TelemetryState->Probes.GetLatestRttMs();
        Payload.Telemetry.Availability.Add(
            TEXT("latencyMs"),
            AvailableMetric(TEXT("websocket-application-probe")));
    }
    else
    {
        const bool bAnyProbeResolved = TelemetryState.IsValid() &&
            TelemetryState->Probes.GetCompletedSampleCount() > 0;
        Payload.Telemetry.Availability.Add(
            TEXT("latencyMs"),
            UnavailableMetric(bAnyProbeResolved ? TEXT("probe-timeout") : TEXT("warming-up")));
    }

    const bool bLossWindowReady = TelemetryState.IsValid() && TelemetryState->Probes.HasMinimumSamples();
    if (bLossWindowReady)
    {
        Payload.Telemetry.PacketLossPct = TelemetryState->Probes.GetPacketLossPct();
        Payload.Telemetry.Availability.Add(
            TEXT("packetLossPct"),
            AvailableMetric(TEXT("websocket-application-probe")));
    }
    else
    {
        Payload.Telemetry.Availability.Add(
            TEXT("packetLossPct"),
            UnavailableMetric(TEXT("warming-up")));
    }

    Payload.Telemetry.Availability.Add(TEXT("cpuPct"), UnavailableMetric(TEXT("not-implemented")));
    Payload.Telemetry.Availability.Add(TEXT("gpuPct"), UnavailableMetric(TEXT("not-implemented")));
    Payload.Telemetry.Availability.Add(
        TEXT("memoryMb"),
        Payload.Telemetry.MemoryMb > 0.0f
            ? AvailableMetric(TEXT("platform-memory"))
            : UnavailableMetric(TEXT("read-failed")));

    FQuestSupervisorBatteryTelemetry BatteryTelemetry;
    AndroidBridge.ReadBatteryTelemetry(BatteryTelemetry);
    if (BatteryTelemetry.bHasBatteryPct)
    {
        Payload.Telemetry.BatteryPct = BatteryTelemetry.BatteryPct;
        Payload.Telemetry.Availability.Add(TEXT("batteryPct"), AvailableMetric(TEXT("android-battery")));
    }
    else
    {
#if PLATFORM_ANDROID
        Payload.Telemetry.Availability.Add(TEXT("batteryPct"), UnavailableMetric(TEXT("read-failed")));
#else
        Payload.Telemetry.Availability.Add(TEXT("batteryPct"), UnavailableMetric(TEXT("unsupported-platform")));
#endif
    }

    if (BatteryTelemetry.bHasTemperatureC)
    {
        Payload.Telemetry.BatteryTemperatureC = BatteryTelemetry.TemperatureC;
        Payload.Telemetry.TemperatureC = Payload.Telemetry.BatteryTemperatureC;
        Payload.Telemetry.Availability.Add(
            TEXT("batteryTemperatureC"),
            AvailableMetric(TEXT("android-battery")));
    }
    else
    {
#if PLATFORM_ANDROID
        Payload.Telemetry.Availability.Add(
            TEXT("batteryTemperatureC"),
            UnavailableMetric(TEXT("read-failed")));
#else
        Payload.Telemetry.Availability.Add(
            TEXT("batteryTemperatureC"),
            UnavailableMetric(TEXT("unsupported-platform")));
#endif
    }
}

float UQuestSupervisorSubsystem::GetSupervisorUptimeSeconds() const
{
    if (SessionStartSeconds <= 0.0)
    {
        return 0.0f;
    }

    return static_cast<float>(FMath::Max(0.0, FPlatformTime::Seconds() - SessionStartSeconds));
}

float UQuestSupervisorSubsystem::GetExperienceElapsedSeconds() const
{
    return TelemetryState.IsValid()
        ? TelemetryState->Experience.GetElapsedSeconds(FPlatformTime::Seconds())
        : 0.0f;
}

float UQuestSupervisorSubsystem::GetCurrentFramesPerSecond() const
{
    return TelemetryState.IsValid() ? TelemetryState->FrameRate.GetFramesPerSecond() : 0.0f;
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
        const FString ActiveRunId = TelemetryState.IsValid() && TelemetryState->Experience.IsActive()
            ? TelemetryState->Experience.GetRunId()
            : PendingExperienceRunId;
        if (Payload.Event.Equals(TEXT("ended"), ESearchCase::IgnoreCase) && !ActiveRunId.IsEmpty())
        {
            Payload.RunId = ActiveRunId;
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
