#pragma once

#include "Components/ActorComponent.h"
#include "CoreMinimal.h"
#include "QuestSupervisorTypes.h"
#include "QuestSupervisorComponent.generated.h"

class UQuestSupervisorSubsystem;

UCLASS(ClassGroup = (QuestSupervisor), meta = (BlueprintSpawnableComponent))
class QUESTSUPERVISOR_API UQuestSupervisorComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UQuestSupervisorComponent();

    UPROPERTY(BlueprintAssignable, Category = "QuestSupervisor")
    FQuestSupervisorCommandReceivedSignature OnCommandReceived;

    UPROPERTY(BlueprintAssignable, Category = "QuestSupervisor")
    FQuestSupervisorTransportStateChangedSignature OnTransportStateChanged;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor")
    bool bStartSupervisorOnBeginPlay = false;

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    bool StartSupervisor();

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    void StopSupervisor();

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    bool AcceptCommand(const FString& CommandId, const FString& Message = TEXT(""));

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    bool RejectCommand(const FString& CommandId, const FString& Reason);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    bool SendHeartbeat(const FQuestSupervisorHeartbeat& Heartbeat);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor", meta = (DisplayName = "Send Experience Marker (Advanced)"))
    bool SendExperienceMarker(const FQuestSupervisorExperienceMarker& Marker);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor", meta = (DisplayName = "Send Experience Marker"))
    bool SendExperienceMarkerSimple(
        const FString& Label,
        const FString& Note = TEXT(""),
        const FString& Source = TEXT("xr"),
        const FString& Reason = TEXT(""));

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor", meta = (DisplayName = "Send Experience Lifecycle Event"))
    bool SendExperienceLifecycleEvent(const FQuestSupervisorExperienceLifecycleEvent& Event);

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor", meta = (DisplayName = "Start Experience"))
    bool StartExperience(const FString& Label = TEXT(""), const FString& Reason = TEXT(""));

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor", meta = (DisplayName = "End Experience"))
    bool EndExperience(const FString& Reason = TEXT(""));

    UFUNCTION(BlueprintPure, Category = "QuestSupervisor")
    EQuestSupervisorTransportState GetTransportState() const;

    UFUNCTION(BlueprintPure, Category = "QuestSupervisor")
    bool IsDeviceRegistered() const;

protected:
    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

private:
    UFUNCTION()
    void HandleCommandReceived(FQuestSupervisorCommandRequest Command);

    UFUNCTION()
    void HandleTransportStateChanged(EQuestSupervisorTransportState PreviousState, EQuestSupervisorTransportState NewState);

    UQuestSupervisorSubsystem* GetSupervisorSubsystem() const;
    void BindSubsystem();
    void UnbindSubsystem();

    UPROPERTY(Transient)
    UQuestSupervisorSubsystem* BoundSubsystem = nullptr;
};
