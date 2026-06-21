#pragma once

#include "Containers/Ticker.h"
#include "CoreMinimal.h"
#include "Engine/GameInstance.h"
#include "QuestSupervisorTypes.h"
#include "QuestSupervisorHostGameInstance.generated.h"

class UQuestSupervisorSubsystem;

UCLASS()
class QUESTSUPERVISORHOST_API UQuestSupervisorHostGameInstance : public UGameInstance
{
    GENERATED_BODY()

public:
    virtual void Init() override;
    virtual void Shutdown() override;

private:
    void BindSupervisorEvents();
    void UnbindSupervisorEvents();
    void StartSupervisorDiagnostics();
    void StopSupervisorDiagnostics();
    bool HandleSupervisorDiagnosticsTick(float DeltaTime);
    bool ShouldAcceptSupervisorCommand(const FQuestSupervisorCommandRequest& Command, FString& OutMessage) const;
    void PublishObservedSessionState(const FQuestSupervisorCommandRequest& Command, UQuestSupervisorSubsystem* SupervisorSubsystem);

    UFUNCTION()
    void HandleSupervisorCommand(FQuestSupervisorCommandRequest Command);

    FTSTicker::FDelegateHandle DiagnosticsTickerHandle;
};
