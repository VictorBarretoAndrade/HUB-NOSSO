#include "QuestSupervisorComponent.h"

#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "QuestSupervisorSubsystem.h"

UQuestSupervisorComponent::UQuestSupervisorComponent()
{
    PrimaryComponentTick.bCanEverTick = false;
}

void UQuestSupervisorComponent::BeginPlay()
{
    Super::BeginPlay();

    BindSubsystem();
    if (bStartSupervisorOnBeginPlay)
    {
        StartSupervisor();
    }
}

void UQuestSupervisorComponent::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    UnbindSubsystem();
    Super::EndPlay(EndPlayReason);
}

bool UQuestSupervisorComponent::StartSupervisor()
{
    UQuestSupervisorSubsystem* Supervisor = GetSupervisorSubsystem();
    return Supervisor ? Supervisor->StartSupervisor() : false;
}

void UQuestSupervisorComponent::StopSupervisor()
{
    if (UQuestSupervisorSubsystem* Supervisor = GetSupervisorSubsystem())
    {
        Supervisor->StopSupervisor();
    }
}

bool UQuestSupervisorComponent::AcceptCommand(const FString& CommandId, const FString& Message)
{
    UQuestSupervisorSubsystem* Supervisor = GetSupervisorSubsystem();
    return Supervisor ? Supervisor->AcceptCommand(CommandId, Message) : false;
}

bool UQuestSupervisorComponent::RejectCommand(const FString& CommandId, const FString& Reason)
{
    UQuestSupervisorSubsystem* Supervisor = GetSupervisorSubsystem();
    return Supervisor ? Supervisor->RejectCommand(CommandId, Reason) : false;
}

bool UQuestSupervisorComponent::SendHeartbeat(const FQuestSupervisorHeartbeat& Heartbeat)
{
    UQuestSupervisorSubsystem* Supervisor = GetSupervisorSubsystem();
    return Supervisor ? Supervisor->SendHeartbeat(Heartbeat) : false;
}

bool UQuestSupervisorComponent::SendExperienceMarker(const FQuestSupervisorExperienceMarker& Marker)
{
    UQuestSupervisorSubsystem* Supervisor = GetSupervisorSubsystem();
    return Supervisor ? Supervisor->SendExperienceMarker(Marker) : false;
}

bool UQuestSupervisorComponent::SendExperienceMarkerSimple(
    const FString& Label,
    const FString& Note,
    const FString& Source,
    const FString& Reason)
{
    FQuestSupervisorExperienceMarker Marker;
    Marker.Label = Label;
    Marker.Note = Note;
    Marker.Source = Source.IsEmpty() ? TEXT("xr") : Source;
    Marker.Reason = Reason;
    return SendExperienceMarker(Marker);
}

bool UQuestSupervisorComponent::SendExperienceLifecycleEvent(const FQuestSupervisorExperienceLifecycleEvent& Event)
{
    UQuestSupervisorSubsystem* Supervisor = GetSupervisorSubsystem();
    return Supervisor ? Supervisor->SendExperienceLifecycleEvent(Event) : false;
}

bool UQuestSupervisorComponent::StartExperience(const FString& Label, const FString& Reason)
{
    UQuestSupervisorSubsystem* Supervisor = GetSupervisorSubsystem();
    return Supervisor ? Supervisor->StartExperience(Label, Reason) : false;
}

bool UQuestSupervisorComponent::EndExperience(const FString& Reason)
{
    UQuestSupervisorSubsystem* Supervisor = GetSupervisorSubsystem();
    return Supervisor ? Supervisor->EndExperience(Reason) : false;
}

EQuestSupervisorTransportState UQuestSupervisorComponent::GetTransportState() const
{
    const UQuestSupervisorSubsystem* Supervisor = GetSupervisorSubsystem();
    return Supervisor ? Supervisor->GetTransportState() : EQuestSupervisorTransportState::Disconnected;
}

bool UQuestSupervisorComponent::IsDeviceRegistered() const
{
    const UQuestSupervisorSubsystem* Supervisor = GetSupervisorSubsystem();
    return Supervisor ? Supervisor->IsDeviceRegistered() : false;
}

void UQuestSupervisorComponent::HandleCommandReceived(FQuestSupervisorCommandRequest Command)
{
    OnCommandReceived.Broadcast(Command);
}

void UQuestSupervisorComponent::HandleTransportStateChanged(EQuestSupervisorTransportState PreviousState, EQuestSupervisorTransportState NewState)
{
    OnTransportStateChanged.Broadcast(PreviousState, NewState);
}

UQuestSupervisorSubsystem* UQuestSupervisorComponent::GetSupervisorSubsystem() const
{
    UWorld* World = GetWorld();
    UGameInstance* GameInstance = World ? World->GetGameInstance() : nullptr;
    return GameInstance ? GameInstance->GetSubsystem<UQuestSupervisorSubsystem>() : nullptr;
}

void UQuestSupervisorComponent::BindSubsystem()
{
    UQuestSupervisorSubsystem* Supervisor = GetSupervisorSubsystem();
    if (!Supervisor || BoundSubsystem == Supervisor)
    {
        return;
    }

    UnbindSubsystem();
    BoundSubsystem = Supervisor;
    BoundSubsystem->OnCommandReceived.AddDynamic(this, &UQuestSupervisorComponent::HandleCommandReceived);
    BoundSubsystem->OnTransportStateChanged.AddDynamic(this, &UQuestSupervisorComponent::HandleTransportStateChanged);
}

void UQuestSupervisorComponent::UnbindSubsystem()
{
    if (!BoundSubsystem)
    {
        return;
    }

    BoundSubsystem->OnCommandReceived.RemoveDynamic(this, &UQuestSupervisorComponent::HandleCommandReceived);
    BoundSubsystem->OnTransportStateChanged.RemoveDynamic(this, &UQuestSupervisorComponent::HandleTransportStateChanged);
    BoundSubsystem = nullptr;
}
