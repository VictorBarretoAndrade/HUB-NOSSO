#pragma once

#include "CoreMinimal.h"
#include "QuestSupervisorTypes.generated.h"

UENUM(BlueprintType)
enum class EQuestSupervisorDeviceStatus : uint8
{
    Online UMETA(DisplayName = "Online"),
    Idle UMETA(DisplayName = "Idle"),
    Busy UMETA(DisplayName = "Busy"),
    Error UMETA(DisplayName = "Error"),
    Offline UMETA(DisplayName = "Offline")
};

UENUM(BlueprintType)
enum class EQuestSupervisorCommandTarget : uint8
{
    Single UMETA(DisplayName = "Single"),
    Batch UMETA(DisplayName = "Batch")
};

UENUM(BlueprintType)
enum class EQuestSupervisorLogLevel : uint8
{
    Debug UMETA(DisplayName = "Debug"),
    Info UMETA(DisplayName = "Info"),
    Warn UMETA(DisplayName = "Warn"),
    Error UMETA(DisplayName = "Error")
};

UENUM(BlueprintType)
enum class EQuestSupervisorTransportState : uint8
{
    Disconnected UMETA(DisplayName = "Disconnected"),
    Connecting UMETA(DisplayName = "Connecting"),
    Connected UMETA(DisplayName = "Connected"),
    Error UMETA(DisplayName = "Error")
};

USTRUCT(BlueprintType)
struct FQuestSupervisorDeviceCapabilities
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    bool bSceneLoading = true;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    bool bTelemetry = true;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    bool bCommandExecution = true;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    bool bLogs = true;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    bool bFutureStreaming = false;
};

USTRUCT(BlueprintType)
struct FQuestSupervisorRuntimeConfig
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    bool bSupervisorEnabled = true;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    bool bAutoConnectOnStartup = false;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString SupervisorEndpoint;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    bool bAutoAckCommands = true;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    float HeartbeatIntervalSeconds = 2.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    float InitialReconnectDelaySeconds = 1.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    float MaxReconnectDelaySeconds = 30.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString AuthToken;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString DeviceId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString DeviceLabel;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString AppId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString AppVersion = TEXT("0.1.0");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString HeadsetModel = TEXT("Meta Quest 3");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FQuestSupervisorDeviceCapabilities Capabilities;
};

USTRUCT(BlueprintType)
struct FQuestSupervisorTelemetrySnapshot
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    float FPS = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    float LatencyMs = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    float BatteryPct = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    float CpuPct = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    float GpuPct = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    float MemoryMb = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    float TemperatureC = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    float PacketLossPct = 0.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    float SessionElapsedSec = 0.0f;
};

USTRUCT(BlueprintType)
struct FQuestSupervisorDeviceRegistration
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString DeviceId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString DeviceLabel;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString AppId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString AppVersion;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString HeadsetModel = TEXT("Meta Quest 3");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString SessionId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FQuestSupervisorDeviceCapabilities Capabilities;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString Timestamp;
};

USTRUCT(BlueprintType)
struct FQuestSupervisorHeartbeat
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString DeviceId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString Timestamp;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    EQuestSupervisorDeviceStatus Status = EQuestSupervisorDeviceStatus::Online;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FQuestSupervisorTelemetrySnapshot Telemetry;
};

USTRUCT(BlueprintType)
struct FQuestSupervisorCommandRequest
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString CommandId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString Action;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    EQuestSupervisorCommandTarget Target = EQuestSupervisorCommandTarget::Single;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    TMap<FString, FString> Arguments;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString IssuedAt;
};

USTRUCT(BlueprintType)
struct FQuestSupervisorCommandAck
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString CommandId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString DeviceId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString ReceivedAt;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString Status;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString Message;
};

USTRUCT(BlueprintType)
struct FQuestSupervisorLogEntry
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString DeviceId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString Timestamp;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    EQuestSupervisorLogLevel Level = EQuestSupervisorLogLevel::Info;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString Message;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString Category;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    TMap<FString, FString> Context;
};

USTRUCT(BlueprintType)
struct FQuestSupervisorExperienceMarker
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString DeviceId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString Timestamp;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString MarkerId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString CommandId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString Label;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString Note;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString Source = TEXT("xr");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString Reason;
};

USTRUCT(BlueprintType)
struct FQuestSupervisorExperienceLifecycleEvent
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString DeviceId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString Timestamp;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString RunId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString Event;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString Label;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString Source = TEXT("xr");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    FString Reason;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FQuestSupervisorCommandReceivedSignature, FQuestSupervisorCommandRequest, Command);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FQuestSupervisorTransportStateChangedSignature, EQuestSupervisorTransportState, PreviousState, EQuestSupervisorTransportState, NewState);
