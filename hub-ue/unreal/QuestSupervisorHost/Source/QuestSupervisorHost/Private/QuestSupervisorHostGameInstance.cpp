#include "QuestSupervisorHostGameInstance.h"

#include "Containers/Ticker.h"
#include "QuestSupervisorSubsystem.h"

DEFINE_LOG_CATEGORY_STATIC(LogQuestSupervisorHost, Log, All);

void UQuestSupervisorHostGameInstance::Init()
{
    Super::Init();

    BindSupervisorEvents();
    StartSupervisorDiagnostics();
}

void UQuestSupervisorHostGameInstance::Shutdown()
{
    StopSupervisorDiagnostics();
    UnbindSupervisorEvents();
    Super::Shutdown();
}

void UQuestSupervisorHostGameInstance::BindSupervisorEvents()
{
    UQuestSupervisorSubsystem* SupervisorSubsystem = GetSubsystem<UQuestSupervisorSubsystem>();
    if (!SupervisorSubsystem)
    {
        UE_LOG(LogQuestSupervisorHost, Error, TEXT("QuestSupervisor event binding failed: subsystem was not available."));
        return;
    }

    SupervisorSubsystem->OnCommandReceived.RemoveDynamic(this, &UQuestSupervisorHostGameInstance::HandleSupervisorCommand);
    SupervisorSubsystem->OnCommandReceived.AddDynamic(this, &UQuestSupervisorHostGameInstance::HandleSupervisorCommand);
    UE_LOG(
        LogQuestSupervisorHost,
        Log,
        TEXT("QuestSupervisorHost bound command handler. AutoAckCommands=%s"),
        SupervisorSubsystem->IsAutoAckCommandsEnabled() ? TEXT("true") : TEXT("false"));
}

void UQuestSupervisorHostGameInstance::UnbindSupervisorEvents()
{
    UQuestSupervisorSubsystem* SupervisorSubsystem = GetSubsystem<UQuestSupervisorSubsystem>();
    if (SupervisorSubsystem)
    {
        SupervisorSubsystem->OnCommandReceived.RemoveDynamic(this, &UQuestSupervisorHostGameInstance::HandleSupervisorCommand);
    }
}

void UQuestSupervisorHostGameInstance::StartSupervisorDiagnostics()
{
    if (DiagnosticsTickerHandle.IsValid())
    {
        return;
    }

    DiagnosticsTickerHandle = FTSTicker::GetCoreTicker().AddTicker(
        FTickerDelegate::CreateUObject(this, &UQuestSupervisorHostGameInstance::HandleSupervisorDiagnosticsTick),
        5.0f);
}

void UQuestSupervisorHostGameInstance::StopSupervisorDiagnostics()
{
    if (!DiagnosticsTickerHandle.IsValid())
    {
        return;
    }

    FTSTicker::GetCoreTicker().RemoveTicker(DiagnosticsTickerHandle);
    DiagnosticsTickerHandle.Reset();
}

bool UQuestSupervisorHostGameInstance::HandleSupervisorDiagnosticsTick(float DeltaTime)
{
    UQuestSupervisorSubsystem* SupervisorSubsystem = GetSubsystem<UQuestSupervisorSubsystem>();
    if (!SupervisorSubsystem)
    {
        UE_LOG(LogQuestSupervisorHost, Warning, TEXT("QuestSupervisor diagnostics: subsystem unavailable."));
        return true;
    }

    UE_LOG(
        LogQuestSupervisorHost,
        Log,
        TEXT("QuestSupervisor diagnostics: State=%d Registered=%s LastHeartbeat=%s LastRegistration=%s LastError=%s QueuedMessages=%d"),
        static_cast<int32>(SupervisorSubsystem->GetTransportState()),
        SupervisorSubsystem->IsDeviceRegistered() ? TEXT("true") : TEXT("false"),
        *SupervisorSubsystem->GetLastHeartbeatTimestamp(),
        *SupervisorSubsystem->GetLastRegistrationTimestamp(),
        SupervisorSubsystem->GetLastConnectionError().IsEmpty() ? TEXT("<empty>") : *SupervisorSubsystem->GetLastConnectionError(),
        SupervisorSubsystem->GetQueuedMessages().Num());

    return true;
}

bool UQuestSupervisorHostGameInstance::ShouldAcceptSupervisorCommand(
    const FQuestSupervisorCommandRequest& Command,
    FString& OutMessage) const
{
    if (
        Command.Action.Equals(TEXT("pause-session"), ESearchCase::IgnoreCase) ||
        Command.Action.Equals(TEXT("resume-session"), ESearchCase::IgnoreCase))
    {
        OutMessage = FString::Printf(TEXT("QuestSupervisorHost accepted %s."), *Command.Action);
        return true;
    }

    if (Command.Action.Equals(TEXT("add-marker"), ESearchCase::IgnoreCase))
    {
        const FString* LabelValue = Command.Arguments.Find(TEXT("label"));
        FString Label = LabelValue ? *LabelValue : FString();
        Label.TrimStartAndEndInline();
        if (Label.IsEmpty())
        {
            OutMessage = TEXT("Marker label is required.");
            return false;
        }

        OutMessage = FString::Printf(TEXT("QuestSupervisorHost accepted marker '%s'."), *Label);
        return true;
    }

    OutMessage = FString::Printf(
        TEXT("QuestSupervisorHost rejected unsupported command action '%s'."),
        Command.Action.IsEmpty() ? TEXT("<empty>") : *Command.Action);
    return false;
}

void UQuestSupervisorHostGameInstance::PublishObservedSessionState(
    const FQuestSupervisorCommandRequest& Command,
    UQuestSupervisorSubsystem* SupervisorSubsystem)
{
    if (!SupervisorSubsystem)
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

    const bool bStateSent = SupervisorSubsystem->SendHeartbeat(Heartbeat);
    UE_LOG(
        LogQuestSupervisorHost,
        Log,
        TEXT("QuestSupervisor observed session state %s for command %s."),
        bStateSent ? TEXT("published") : TEXT("failed"),
        *Command.CommandId);
}

void UQuestSupervisorHostGameInstance::HandleSupervisorCommand(FQuestSupervisorCommandRequest Command)
{
    FString ArgumentsSummary;
    for (const TPair<FString, FString>& Pair : Command.Arguments)
    {
        if (!ArgumentsSummary.IsEmpty())
        {
            ArgumentsSummary += TEXT(", ");
        }

        ArgumentsSummary += FString::Printf(TEXT("%s=%s"), *Pair.Key, *Pair.Value);
    }

    UE_LOG(
        LogQuestSupervisorHost,
        Log,
        TEXT("QuestSupervisor command received: CommandId=%s Action=%s Target=%d Arguments=[%s]"),
        *Command.CommandId,
        *Command.Action,
        static_cast<int32>(Command.Target),
        ArgumentsSummary.IsEmpty() ? TEXT("") : *ArgumentsSummary);

    UQuestSupervisorSubsystem* SupervisorSubsystem = GetSubsystem<UQuestSupervisorSubsystem>();
    if (!SupervisorSubsystem)
    {
        UE_LOG(LogQuestSupervisorHost, Error, TEXT("QuestSupervisor command ACK skipped: subsystem unavailable."));
        return;
    }

    if (SupervisorSubsystem->IsAutoAckCommandsEnabled())
    {
        UE_LOG(LogQuestSupervisorHost, Log, TEXT("QuestSupervisor command ACK already handled by plugin auto-ACK mode."));
        return;
    }

    FString DecisionMessage;
    const bool bAccepted = ShouldAcceptSupervisorCommand(Command, DecisionMessage);
    const bool bAckSent = bAccepted
        ? SupervisorSubsystem->AcceptCommand(Command.CommandId, DecisionMessage)
        : SupervisorSubsystem->RejectCommand(Command.CommandId, DecisionMessage);

    if (bAccepted && bAckSent)
    {
        PublishObservedSessionState(Command, SupervisorSubsystem);
    }

    if (bAccepted && bAckSent && Command.Action.Equals(TEXT("add-marker"), ESearchCase::IgnoreCase))
    {
        const FString* LabelValue = Command.Arguments.Find(TEXT("label"));
        const FString* MarkerIdValue = Command.Arguments.Find(TEXT("markerId"));
        const FString* NoteValue = Command.Arguments.Find(TEXT("note"));
        const FString* ReasonValue = Command.Arguments.Find(TEXT("reason"));

        FQuestSupervisorExperienceMarker Marker;
        Marker.CommandId = Command.CommandId;
        Marker.MarkerId = MarkerIdValue ? *MarkerIdValue : Command.CommandId;
        Marker.Label = LabelValue ? *LabelValue : FString();
        Marker.Note = NoteValue ? *NoteValue : FString();
        Marker.Source = TEXT("dashboard");
        Marker.Reason = ReasonValue ? *ReasonValue : FString();

        const bool bMarkerSent = SupervisorSubsystem->SendExperienceMarker(Marker);
        UE_LOG(
            LogQuestSupervisorHost,
            Log,
            TEXT("QuestSupervisor marker event %s for command %s."),
            bMarkerSent ? TEXT("published") : TEXT("failed"),
            *Command.CommandId);
    }

    UE_LOG(
        LogQuestSupervisorHost,
        Log,
        TEXT("QuestSupervisor manual command ACK %s for command %s with decision %s: %s"),
        bAckSent ? TEXT("sent") : TEXT("failed"),
        *Command.CommandId,
        bAccepted ? TEXT("accepted") : TEXT("rejected"),
        *DecisionMessage);
}
