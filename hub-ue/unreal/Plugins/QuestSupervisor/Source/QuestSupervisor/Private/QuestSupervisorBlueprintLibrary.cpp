#include "QuestSupervisorBlueprintLibrary.h"

#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "QuestSupervisorSubsystem.h"

UQuestSupervisorSubsystem* UQuestSupervisorBlueprintLibrary::GetQuestSupervisorSubsystem(const UObject* WorldContextObject)
{
    if (!WorldContextObject)
    {
        return nullptr;
    }

    const UWorld* World = WorldContextObject->GetWorld();
    if (!World)
    {
        return nullptr;
    }

    return World->GetGameInstance() ? World->GetGameInstance()->GetSubsystem<UQuestSupervisorSubsystem>() : nullptr;
}

bool UQuestSupervisorBlueprintLibrary::ConfigureSupervisorEndpoint(const UObject* WorldContextObject, const FString& EndpointUrl)
{
    if (UQuestSupervisorSubsystem* Subsystem = GetQuestSupervisorSubsystem(WorldContextObject))
    {
        return Subsystem->ConfigureSupervisorEndpoint(EndpointUrl);
    }

    return false;
}

void UQuestSupervisorBlueprintLibrary::ApplyRuntimeConfig(const UObject* WorldContextObject, const FQuestSupervisorRuntimeConfig& Config)
{
    if (UQuestSupervisorSubsystem* Subsystem = GetQuestSupervisorSubsystem(WorldContextObject))
    {
        Subsystem->ApplyRuntimeConfig(Config);
    }
}

void UQuestSupervisorBlueprintLibrary::SetSupervisorEnabled(const UObject* WorldContextObject, bool bEnabled)
{
    if (UQuestSupervisorSubsystem* Subsystem = GetQuestSupervisorSubsystem(WorldContextObject))
    {
        Subsystem->SetSupervisorEnabled(bEnabled);
    }
}

void UQuestSupervisorBlueprintLibrary::SetAutoAckCommands(const UObject* WorldContextObject, bool bEnabled)
{
    if (UQuestSupervisorSubsystem* Subsystem = GetQuestSupervisorSubsystem(WorldContextObject))
    {
        Subsystem->SetAutoAckCommands(bEnabled);
    }
}

bool UQuestSupervisorBlueprintLibrary::RegisterDevice(const UObject* WorldContextObject, const FQuestSupervisorDeviceRegistration& Registration)
{
    if (UQuestSupervisorSubsystem* Subsystem = GetQuestSupervisorSubsystem(WorldContextObject))
    {
        return Subsystem->RegisterDevice(Registration);
    }

    return false;
}

bool UQuestSupervisorBlueprintLibrary::SendHeartbeat(const UObject* WorldContextObject, const FQuestSupervisorHeartbeat& Heartbeat)
{
    if (UQuestSupervisorSubsystem* Subsystem = GetQuestSupervisorSubsystem(WorldContextObject))
    {
        return Subsystem->SendHeartbeat(Heartbeat);
    }

    return false;
}

bool UQuestSupervisorBlueprintLibrary::SendLogEntry(const UObject* WorldContextObject, const FQuestSupervisorLogEntry& Entry)
{
    if (UQuestSupervisorSubsystem* Subsystem = GetQuestSupervisorSubsystem(WorldContextObject))
    {
        return Subsystem->SendLogEntry(Entry);
    }

    return false;
}

bool UQuestSupervisorBlueprintLibrary::SendExperienceMarker(const UObject* WorldContextObject, const FQuestSupervisorExperienceMarker& Marker)
{
    if (UQuestSupervisorSubsystem* Subsystem = GetQuestSupervisorSubsystem(WorldContextObject))
    {
        return Subsystem->SendExperienceMarker(Marker);
    }

    return false;
}

bool UQuestSupervisorBlueprintLibrary::SendExperienceMarkerSimple(
    const UObject* WorldContextObject,
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
    return SendExperienceMarker(WorldContextObject, Marker);
}

bool UQuestSupervisorBlueprintLibrary::SendExperienceLifecycleEvent(const UObject* WorldContextObject, const FQuestSupervisorExperienceLifecycleEvent& Event)
{
    if (UQuestSupervisorSubsystem* Subsystem = GetQuestSupervisorSubsystem(WorldContextObject))
    {
        return Subsystem->SendExperienceLifecycleEvent(Event);
    }

    return false;
}

bool UQuestSupervisorBlueprintLibrary::StartExperience(const UObject* WorldContextObject, const FString& Label, const FString& Reason)
{
    if (UQuestSupervisorSubsystem* Subsystem = GetQuestSupervisorSubsystem(WorldContextObject))
    {
        return Subsystem->StartExperience(Label, Reason);
    }

    return false;
}

bool UQuestSupervisorBlueprintLibrary::EndExperience(const UObject* WorldContextObject, const FString& Reason)
{
    if (UQuestSupervisorSubsystem* Subsystem = GetQuestSupervisorSubsystem(WorldContextObject))
    {
        return Subsystem->EndExperience(Reason);
    }

    return false;
}

bool UQuestSupervisorBlueprintLibrary::SendCommandAck(const UObject* WorldContextObject, const FQuestSupervisorCommandAck& Ack)
{
    if (UQuestSupervisorSubsystem* Subsystem = GetQuestSupervisorSubsystem(WorldContextObject))
    {
        return Subsystem->SendCommandAck(Ack);
    }

    return false;
}

bool UQuestSupervisorBlueprintLibrary::AcceptCommand(const UObject* WorldContextObject, const FString& CommandId, const FString& Message)
{
    if (UQuestSupervisorSubsystem* Subsystem = GetQuestSupervisorSubsystem(WorldContextObject))
    {
        return Subsystem->AcceptCommand(CommandId, Message);
    }

    return false;
}

bool UQuestSupervisorBlueprintLibrary::RejectCommand(const UObject* WorldContextObject, const FString& CommandId, const FString& Reason)
{
    if (UQuestSupervisorSubsystem* Subsystem = GetQuestSupervisorSubsystem(WorldContextObject))
    {
        return Subsystem->RejectCommand(CommandId, Reason);
    }

    return false;
}

EQuestSupervisorTransportState UQuestSupervisorBlueprintLibrary::GetTransportState(const UObject* WorldContextObject)
{
    if (UQuestSupervisorSubsystem* Subsystem = GetQuestSupervisorSubsystem(WorldContextObject))
    {
        return Subsystem->GetTransportState();
    }

    return EQuestSupervisorTransportState::Disconnected;
}

bool UQuestSupervisorBlueprintLibrary::IsDeviceRegistered(const UObject* WorldContextObject)
{
    if (UQuestSupervisorSubsystem* Subsystem = GetQuestSupervisorSubsystem(WorldContextObject))
    {
        return Subsystem->IsDeviceRegistered();
    }

    return false;
}

bool UQuestSupervisorBlueprintLibrary::IsSupervisorEnabled(const UObject* WorldContextObject)
{
    if (UQuestSupervisorSubsystem* Subsystem = GetQuestSupervisorSubsystem(WorldContextObject))
    {
        return Subsystem->IsSupervisorEnabled();
    }

    return false;
}

bool UQuestSupervisorBlueprintLibrary::IsAutoAckCommandsEnabled(const UObject* WorldContextObject)
{
    if (UQuestSupervisorSubsystem* Subsystem = GetQuestSupervisorSubsystem(WorldContextObject))
    {
        return Subsystem->IsAutoAckCommandsEnabled();
    }

    return false;
}
