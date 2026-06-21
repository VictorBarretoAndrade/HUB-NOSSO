#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "QuestSupervisorTypes.h"
#include "QuestSupervisorBlueprintLibrary.generated.h"

class UQuestSupervisorSubsystem;

UCLASS()
class QUESTSUPERVISOR_API UQuestSupervisorBlueprintLibrary : public UBlueprintFunctionLibrary
{
    GENERATED_BODY()

public:
    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor", meta = (WorldContext = "WorldContextObject"))
    static UQuestSupervisorSubsystem* GetQuestSupervisorSubsystem(const UObject* WorldContextObject);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor", meta = (WorldContext = "WorldContextObject"))
    static bool ConfigureSupervisorEndpoint(const UObject* WorldContextObject, const FString& EndpointUrl);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor", meta = (WorldContext = "WorldContextObject"))
    static void ApplyRuntimeConfig(const UObject* WorldContextObject, const FQuestSupervisorRuntimeConfig& Config);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor", meta = (WorldContext = "WorldContextObject"))
    static void SetSupervisorEnabled(const UObject* WorldContextObject, bool bEnabled);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor", meta = (WorldContext = "WorldContextObject"))
    static void SetAutoAckCommands(const UObject* WorldContextObject, bool bEnabled);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor", meta = (WorldContext = "WorldContextObject"))
    static bool RegisterDevice(const UObject* WorldContextObject, const FQuestSupervisorDeviceRegistration& Registration);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor", meta = (WorldContext = "WorldContextObject"))
    static bool SendHeartbeat(const UObject* WorldContextObject, const FQuestSupervisorHeartbeat& Heartbeat);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor", meta = (WorldContext = "WorldContextObject"))
    static bool SendLogEntry(const UObject* WorldContextObject, const FQuestSupervisorLogEntry& Entry);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor", meta = (WorldContext = "WorldContextObject", DisplayName = "Send Experience Marker (Advanced)"))
    static bool SendExperienceMarker(const UObject* WorldContextObject, const FQuestSupervisorExperienceMarker& Marker);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor", meta = (WorldContext = "WorldContextObject", DisplayName = "Send Experience Marker"))
    static bool SendExperienceMarkerSimple(
        const UObject* WorldContextObject,
        const FString& Label,
        const FString& Note = TEXT(""),
        const FString& Source = TEXT("xr"),
        const FString& Reason = TEXT(""));

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor", meta = (WorldContext = "WorldContextObject", DisplayName = "Send Experience Lifecycle Event"))
    static bool SendExperienceLifecycleEvent(const UObject* WorldContextObject, const FQuestSupervisorExperienceLifecycleEvent& Event);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor", meta = (WorldContext = "WorldContextObject", DisplayName = "Start Experience"))
    static bool StartExperience(const UObject* WorldContextObject, const FString& Label = TEXT(""), const FString& Reason = TEXT(""));

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor", meta = (WorldContext = "WorldContextObject", DisplayName = "End Experience"))
    static bool EndExperience(const UObject* WorldContextObject, const FString& Reason = TEXT(""));

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor", meta = (WorldContext = "WorldContextObject"))
    static bool SendCommandAck(const UObject* WorldContextObject, const FQuestSupervisorCommandAck& Ack);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor", meta = (WorldContext = "WorldContextObject"))
    static bool AcceptCommand(const UObject* WorldContextObject, const FString& CommandId, const FString& Message = TEXT(""));

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor", meta = (WorldContext = "WorldContextObject"))
    static bool RejectCommand(const UObject* WorldContextObject, const FString& CommandId, const FString& Reason);

    UFUNCTION(BlueprintPure, Category = "QuestSupervisor", meta = (WorldContext = "WorldContextObject"))
    static EQuestSupervisorTransportState GetTransportState(const UObject* WorldContextObject);

    UFUNCTION(BlueprintPure, Category = "QuestSupervisor", meta = (WorldContext = "WorldContextObject"))
    static bool IsDeviceRegistered(const UObject* WorldContextObject);

    UFUNCTION(BlueprintPure, Category = "QuestSupervisor", meta = (WorldContext = "WorldContextObject"))
    static bool IsSupervisorEnabled(const UObject* WorldContextObject);

    UFUNCTION(BlueprintPure, Category = "QuestSupervisor", meta = (WorldContext = "WorldContextObject"))
    static bool IsAutoAckCommandsEnabled(const UObject* WorldContextObject);
};
