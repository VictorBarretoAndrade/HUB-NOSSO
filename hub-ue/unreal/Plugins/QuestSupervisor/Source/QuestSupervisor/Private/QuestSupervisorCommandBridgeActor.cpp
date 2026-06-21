#include "QuestSupervisorCommandBridgeActor.h"

#include "QuestSupervisorComponent.h"

AQuestSupervisorCommandBridgeActor::AQuestSupervisorCommandBridgeActor()
{
    PrimaryActorTick.bCanEverTick = false;

    SupervisorComponent = CreateDefaultSubobject<UQuestSupervisorComponent>(TEXT("QuestSupervisorComponent"));
    SupervisorComponent->bStartSupervisorOnBeginPlay = false;

    AcceptedCommandActions.Add(TEXT("pause-session"));
    AcceptedCommandActions.Add(TEXT("resume-session"));
    AcceptedCommandActions.Add(TEXT("add-marker"));
}

void AQuestSupervisorCommandBridgeActor::BeginPlay()
{
    Super::BeginPlay();

    if (SupervisorComponent)
    {
        SupervisorComponent->OnCommandReceived.AddDynamic(this, &AQuestSupervisorCommandBridgeActor::HandleCommandReceived);
        SupervisorComponent->OnTransportStateChanged.AddDynamic(this, &AQuestSupervisorCommandBridgeActor::HandleTransportStateChanged);
    }
}

void AQuestSupervisorCommandBridgeActor::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    if (SupervisorComponent)
    {
        SupervisorComponent->OnCommandReceived.RemoveDynamic(this, &AQuestSupervisorCommandBridgeActor::HandleCommandReceived);
        SupervisorComponent->OnTransportStateChanged.RemoveDynamic(this, &AQuestSupervisorCommandBridgeActor::HandleTransportStateChanged);
    }

    Super::EndPlay(EndPlayReason);
}

bool AQuestSupervisorCommandBridgeActor::AcceptCommand(const FString& CommandId, const FString& Message)
{
    return SupervisorComponent ? SupervisorComponent->AcceptCommand(CommandId, Message) : false;
}

bool AQuestSupervisorCommandBridgeActor::RejectCommand(const FString& CommandId, const FString& Reason)
{
    return SupervisorComponent ? SupervisorComponent->RejectCommand(CommandId, Reason) : false;
}

void AQuestSupervisorCommandBridgeActor::HandleCommandReceived(FQuestSupervisorCommandRequest Command)
{
    OnCommandReceived.Broadcast(Command);

    if (!bAutoRespondToCommands)
    {
        return;
    }

    if (IsAcceptedAction(Command.Action))
    {
        if (Command.Action.Equals(TEXT("add-marker"), ESearchCase::IgnoreCase))
        {
            const FString* Label = Command.Arguments.Find(TEXT("label"));
            if (!Label || Label->TrimStartAndEnd().IsEmpty())
            {
                RejectCommand(Command.CommandId, TEXT("Marker label is required."));
                return;
            }
        }

        if (AcceptCommand(Command.CommandId, FString::Printf(TEXT("Command '%s' accepted by QuestSupervisorCommandBridgeActor."), *Command.Action)))
        {
            PublishObservedSessionState(Command);
            PublishExperienceMarker(Command);
        }
        return;
    }

    if (bRejectUnhandledCommands)
    {
        RejectCommand(Command.CommandId, FString::Printf(TEXT("Unsupported command action '%s'."), Command.Action.IsEmpty() ? TEXT("<empty>") : *Command.Action));
    }
}

void AQuestSupervisorCommandBridgeActor::HandleTransportStateChanged(EQuestSupervisorTransportState PreviousState, EQuestSupervisorTransportState NewState)
{
    OnTransportStateChanged.Broadcast(PreviousState, NewState);
}

bool AQuestSupervisorCommandBridgeActor::IsAcceptedAction(const FString& Action) const
{
    for (const FString& AcceptedAction : AcceptedCommandActions)
    {
        if (AcceptedAction.Equals(Action, ESearchCase::IgnoreCase))
        {
            return true;
        }
    }

    return false;
}

void AQuestSupervisorCommandBridgeActor::PublishObservedSessionState(const FQuestSupervisorCommandRequest& Command)
{
    if (!bPublishStateForSessionCommands || !SupervisorComponent)
    {
        return;
    }

    FQuestSupervisorHeartbeat Heartbeat;
    if (Command.Action.Equals(TEXT("pause-session"), ESearchCase::IgnoreCase))
    {
        Heartbeat.Status = EQuestSupervisorDeviceStatus::Idle;
    }
    else if (Command.Action.Equals(TEXT("resume-session"), ESearchCase::IgnoreCase))
    {
        Heartbeat.Status = EQuestSupervisorDeviceStatus::Online;
    }
    else
    {
        return;
    }

    SupervisorComponent->SendHeartbeat(Heartbeat);
}

bool AQuestSupervisorCommandBridgeActor::PublishExperienceMarker(const FQuestSupervisorCommandRequest& Command)
{
    if (!bPublishMarkersForAddMarkerCommands || !SupervisorComponent || !Command.Action.Equals(TEXT("add-marker"), ESearchCase::IgnoreCase))
    {
        return false;
    }

    const FString* Label = Command.Arguments.Find(TEXT("label"));
    if (!Label || Label->TrimStartAndEnd().IsEmpty())
    {
        return false;
    }

    FQuestSupervisorExperienceMarker Marker;
    Marker.CommandId = Command.CommandId;
    Marker.Label = *Label;
    Marker.Source = TEXT("dashboard");
    if (const FString* MarkerId = Command.Arguments.Find(TEXT("markerId")))
    {
        Marker.MarkerId = *MarkerId;
    }
    if (const FString* Note = Command.Arguments.Find(TEXT("note")))
    {
        Marker.Note = *Note;
    }
    if (const FString* Reason = Command.Arguments.Find(TEXT("reason")))
    {
        Marker.Reason = *Reason;
    }

    return SupervisorComponent->SendExperienceMarker(Marker);
}
