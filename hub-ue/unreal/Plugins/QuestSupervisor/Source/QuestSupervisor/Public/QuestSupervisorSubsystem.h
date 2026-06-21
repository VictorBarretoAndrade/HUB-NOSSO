#pragma once

#include "Containers/Ticker.h"
#include "CoreMinimal.h"
#include "QuestSupervisorAndroidBridge.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "QuestSupervisorTypes.h"
#include "QuestSupervisorSubsystem.generated.h"

class FJsonObject;
class IWebSocket;

UCLASS(BlueprintType)
class QUESTSUPERVISOR_API UQuestSupervisorSubsystem : public UGameInstanceSubsystem
{
    GENERATED_BODY()

public:
    UPROPERTY(BlueprintAssignable, Category = "QuestSupervisor")
    FQuestSupervisorCommandReceivedSignature OnCommandReceived;

    UPROPERTY(BlueprintAssignable, Category = "QuestSupervisor")
    FQuestSupervisorTransportStateChangedSignature OnTransportStateChanged;

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    bool StartSupervisor();

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    void StopSupervisor();

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    void ReloadSettings();

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    bool ConfigureSupervisorEndpoint(const FString& InEndpointUrl);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    void ApplyRuntimeConfig(const FQuestSupervisorRuntimeConfig& Config);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    void SetSupervisorEnabled(bool bEnabled);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    void SetAutoAckCommands(bool bEnabled);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    bool RegisterDevice(const FQuestSupervisorDeviceRegistration& Registration);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    bool SendHeartbeat(const FQuestSupervisorHeartbeat& Heartbeat);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    bool SendLogEntry(const FQuestSupervisorLogEntry& Entry);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    bool SendExperienceMarker(const FQuestSupervisorExperienceMarker& Marker);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    bool SendExperienceLifecycleEvent(const FQuestSupervisorExperienceLifecycleEvent& Event);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    bool StartExperience(const FString& Label = TEXT(""), const FString& Reason = TEXT(""));

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    bool EndExperience(const FString& Reason = TEXT(""));

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    bool SendCommandAck(const FQuestSupervisorCommandAck& Ack);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    bool AcceptCommand(const FString& CommandId, const FString& Message = TEXT(""));

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    bool RejectCommand(const FString& CommandId, const FString& Reason);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    bool HandleIncomingMessageJson(const FString& RawJson);

    UFUNCTION(BlueprintPure, Category = "QuestSupervisor")
    EQuestSupervisorTransportState GetTransportState() const;

    UFUNCTION(BlueprintPure, Category = "QuestSupervisor")
    FString GetSupervisorEndpoint() const;

    UFUNCTION(BlueprintPure, Category = "QuestSupervisor")
    TArray<FString> GetQueuedMessages() const;

    UFUNCTION(BlueprintPure, Category = "QuestSupervisor")
    bool IsDeviceRegistered() const;

    UFUNCTION(BlueprintPure, Category = "QuestSupervisor")
    bool IsSupervisorEnabled() const;

    UFUNCTION(BlueprintPure, Category = "QuestSupervisor")
    bool IsAutoAckCommandsEnabled() const;

    UFUNCTION(BlueprintPure, Category = "QuestSupervisor")
    FString GetLastHeartbeatTimestamp() const;

    UFUNCTION(BlueprintPure, Category = "QuestSupervisor")
    FString GetLastRegistrationTimestamp() const;

    UFUNCTION(BlueprintPure, Category = "QuestSupervisor")
    FString GetLastConnectedTimestamp() const;

    UFUNCTION(BlueprintPure, Category = "QuestSupervisor")
    FString GetLastDisconnectedTimestamp() const;

    UFUNCTION(BlueprintPure, Category = "QuestSupervisor")
    FString GetLastConnectionError() const;

    UFUNCTION(BlueprintPure, Category = "QuestSupervisor")
    int32 GetReconnectAttempts() const;

    virtual void Initialize(FSubsystemCollectionBase& Collection) override;
    virtual void Deinitialize() override;

private:
    void LoadRuntimeConfigFromIni();
    FQuestSupervisorDeviceRegistration BuildConfiguredRegistration() const;
    FQuestSupervisorHeartbeat BuildConfiguredHeartbeat() const;
    bool ConnectTransport();
    void DisconnectTransport(bool bIntentional);
    FString BuildSocketUrl() const;
    FString BuildSafeEndpointForLog() const;

    bool EmitJsonMessage(
        const FString& Type,
        const TSharedPtr<FJsonObject>& PayloadObject,
        const FString& Topic = FString(),
        const FString& CorrelationId = FString(),
        bool bRequiresAck = false,
        const FString& CollectedAt = FString(),
        int64 SessionTimeMs = -1);
    bool SendRegistrationMessage(bool bRefreshTimestamp);
    bool SendSubscribeMessage();
    bool ParseAndDispatchCommand(const FString& RawJson);

    void QueueOutgoingMessage(const FString& MessageJson);
    void FlushOutgoingMessages();

    void HandleSocketConnected();
    void HandleSocketClosed(int32 StatusCode, const FString& Reason, bool bWasClean);
    void HandleSocketConnectionError(const FString& Error);
    void HandleSocketMessage(const FString& Message);

    void StartHeartbeatLoop();
    void StopHeartbeatLoop();
    bool HandleHeartbeatTick(float DeltaTime);

    void ScheduleReconnect();
    void StopReconnectLoop();
    bool HandleReconnectTick(float DeltaTime);
    float GetNextReconnectDelaySeconds() const;

    void UpdateTransportState(EQuestSupervisorTransportState NewState);
    bool CanUseSocket() const;

    FQuestSupervisorHeartbeat BuildHeartbeatPayload(const FQuestSupervisorHeartbeat* SourceHeartbeat = nullptr) const;
    void RefreshAutomaticTelemetry(FQuestSupervisorHeartbeat& Payload) const;
    float GetSessionElapsedSeconds() const;
    float GetCurrentFramesPerSecond() const;
    float GetUsedMemoryMegabytes() const;
    FQuestSupervisorLogEntry BuildLogPayload(const FQuestSupervisorLogEntry& Entry) const;
    FQuestSupervisorExperienceMarker BuildExperienceMarkerPayload(const FQuestSupervisorExperienceMarker& Marker) const;
    FQuestSupervisorExperienceLifecycleEvent BuildExperienceLifecyclePayload(const FQuestSupervisorExperienceLifecycleEvent& Event) const;
    FQuestSupervisorCommandAck BuildCommandAckPayload(const FQuestSupervisorCommandAck& Ack) const;
    FString MakeIsoTimestamp() const;
    void SendSystemLog(const FString& Message, EQuestSupervisorLogLevel Level, const FString& Category);

    UPROPERTY()
    FString SupervisorEndpoint;

    UPROPERTY()
    EQuestSupervisorTransportState TransportState = EQuestSupervisorTransportState::Disconnected;

    UPROPERTY()
    TArray<FString> OutgoingMessages;

    UPROPERTY()
    FQuestSupervisorDeviceRegistration CachedRegistration;

    UPROPERTY()
    FQuestSupervisorHeartbeat CachedHeartbeat;

    UPROPERTY()
    FString ActiveExperienceRunId;

    UPROPERTY()
    FString LastHeartbeatTimestamp;

    UPROPERTY()
    FString LastRegistrationTimestamp;

    UPROPERTY()
    FString LastConnectedTimestamp;

    UPROPERTY()
    FString LastDisconnectedTimestamp;

    UPROPERTY()
    FString LastConnectionError;

    UPROPERTY()
    FQuestSupervisorRuntimeConfig RuntimeConfig;

    FQuestSupervisorAndroidBridge AndroidBridge;
    TSharedPtr<IWebSocket> ActiveSocket;

    FTSTicker::FDelegateHandle HeartbeatTickerHandle;
    FTSTicker::FDelegateHandle ReconnectTickerHandle;

    bool bHasRegistration = false;
    bool bHasHeartbeat = false;
    bool bIsRegistered = false;
    bool bIntentionalDisconnect = false;
    int32 ReconnectAttempts = 0;

    double SessionStartSeconds = 0.0;
    float HeartbeatIntervalSeconds = 2.0f;
    float InitialReconnectDelaySeconds = 1.0f;
    float MaxReconnectDelaySeconds = 30.0f;
};
