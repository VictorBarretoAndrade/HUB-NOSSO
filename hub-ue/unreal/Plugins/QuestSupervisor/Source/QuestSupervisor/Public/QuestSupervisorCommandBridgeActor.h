#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "QuestSupervisorTypes.h"
#include "QuestSupervisorCommandBridgeActor.generated.h"

class UQuestSupervisorComponent;

UCLASS(BlueprintType, Blueprintable)
class QUESTSUPERVISOR_API AQuestSupervisorCommandBridgeActor : public AActor
{
    GENERATED_BODY()

public:
    AQuestSupervisorCommandBridgeActor();

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "QuestSupervisor")
    UQuestSupervisorComponent* SupervisorComponent;

    UPROPERTY(BlueprintAssignable, Category = "QuestSupervisor")
    FQuestSupervisorCommandReceivedSignature OnCommandReceived;

    UPROPERTY(BlueprintAssignable, Category = "QuestSupervisor")
    FQuestSupervisorTransportStateChangedSignature OnTransportStateChanged;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor|Commands")
    bool bAutoRespondToCommands = true;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor|Commands")
    bool bRejectUnhandledCommands = true;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor|Commands")
    bool bPublishStateForSessionCommands = true;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor|Commands")
    bool bPublishMarkersForAddMarkerCommands = true;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "QuestSupervisor|Commands")
    TArray<FString> AcceptedCommandActions;

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    bool AcceptCommand(const FString& CommandId, const FString& Message = TEXT(""));

    UFUNCTION(BlueprintCallable, Category = "QuestSupervisor")
    bool RejectCommand(const FString& CommandId, const FString& Reason);

protected:
    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

private:
    UFUNCTION()
    void HandleCommandReceived(FQuestSupervisorCommandRequest Command);

    UFUNCTION()
    void HandleTransportStateChanged(EQuestSupervisorTransportState PreviousState, EQuestSupervisorTransportState NewState);

    bool IsAcceptedAction(const FString& Action) const;
    void PublishObservedSessionState(const FQuestSupervisorCommandRequest& Command);
    bool PublishExperienceMarker(const FQuestSupervisorCommandRequest& Command);
};
