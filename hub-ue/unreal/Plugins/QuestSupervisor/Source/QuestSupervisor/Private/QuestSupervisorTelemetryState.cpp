#include "QuestSupervisorTelemetryState.h"

#include "Dom/JsonObject.h"
#include "QuestSupervisorTypes.h"

uint64 FQuestSupervisorConnectionGeneration::BeginConnection()
{
    return ++CurrentGeneration;
}

void FQuestSupervisorConnectionGeneration::Invalidate()
{
    ++CurrentGeneration;
}

bool FQuestSupervisorConnectionGeneration::IsCurrent(uint64 Generation) const
{
    return Generation != 0 && Generation == CurrentGeneration;
}

void FQuestSupervisorFrameRateWindow::Reset()
{
    AccumulatedSeconds = 0.0;
    AccumulatedFrames = 0;
    FramesPerSecond = 0.0f;
    bHasSample = false;
}

void FQuestSupervisorFrameRateWindow::AddFrame(double DeltaSeconds)
{
    if (!FMath::IsFinite(DeltaSeconds) || DeltaSeconds <= 0.0 || DeltaSeconds > WindowSeconds)
    {
        Reset();
        return;
    }

    AccumulatedSeconds += DeltaSeconds;
    ++AccumulatedFrames;

    if (AccumulatedSeconds + UE_DOUBLE_SMALL_NUMBER < WindowSeconds)
    {
        return;
    }

    FramesPerSecond = static_cast<float>(static_cast<double>(AccumulatedFrames) / AccumulatedSeconds);
    bHasSample = FMath::IsFinite(FramesPerSecond) && FramesPerSecond >= 0.0f;
    AccumulatedSeconds = 0.0;
    AccumulatedFrames = 0;
}

bool FQuestSupervisorFrameRateWindow::HasSample() const
{
    return bHasSample;
}

float FQuestSupervisorFrameRateWindow::GetFramesPerSecond() const
{
    return bHasSample ? FramesPerSecond : 0.0f;
}

void FQuestSupervisorProbeWindow::Reset()
{
    PendingProbes.Reset();
    CompletedSamples.Reset();
    SequenceCounter = 0;
}

int64 FQuestSupervisorProbeWindow::NextSequence()
{
    return ++SequenceCounter;
}

void FQuestSupervisorProbeWindow::AddPending(const FString& MessageId, int64 Sequence, double SentAtSeconds)
{
    if (MessageId.IsEmpty() || !FMath::IsFinite(SentAtSeconds))
    {
        return;
    }

    FQuestSupervisorPendingProbe Pending;
    Pending.Sequence = Sequence;
    Pending.SentAtSeconds = SentAtSeconds;
    PendingProbes.Add(MessageId, Pending);
}

void FQuestSupervisorProbeWindow::RemovePending(const FString& MessageId)
{
    PendingProbes.Remove(MessageId);
}

bool FQuestSupervisorProbeWindow::ResolvePong(
    const FString& CorrelationId,
    const TOptional<int64>& Sequence,
    double ReceivedAtSeconds)
{
    const FQuestSupervisorPendingProbe* Pending = PendingProbes.Find(CorrelationId);
    if (!Pending || !FMath::IsFinite(ReceivedAtSeconds))
    {
        return false;
    }

    if (Sequence.IsSet() && Sequence.GetValue() != Pending->Sequence)
    {
        return false;
    }

    const double RttSeconds = ReceivedAtSeconds - Pending->SentAtSeconds;
    if (RttSeconds < 0.0 || RttSeconds >= TimeoutSeconds)
    {
        return false;
    }

    PendingProbes.Remove(CorrelationId);
    AddCompletedSample(true, RttSeconds * 1000.0);
    return true;
}

void FQuestSupervisorProbeWindow::ExpireTimedOut(double NowSeconds)
{
    if (!FMath::IsFinite(NowSeconds))
    {
        return;
    }

    TArray<FString> TimedOutIds;
    for (const TPair<FString, FQuestSupervisorPendingProbe>& Pair : PendingProbes)
    {
        if (NowSeconds - Pair.Value.SentAtSeconds >= TimeoutSeconds)
        {
            TimedOutIds.Add(Pair.Key);
        }
    }

    for (const FString& MessageId : TimedOutIds)
    {
        PendingProbes.Remove(MessageId);
        AddCompletedSample(false, 0.0);
    }
}

bool FQuestSupervisorProbeWindow::HasMinimumSamples() const
{
    return CompletedSamples.Num() >= MinimumSamples;
}

bool FQuestSupervisorProbeWindow::HasSuccessfulSample() const
{
    return CompletedSamples.ContainsByPredicate(
        [](const FQuestSupervisorProbeSample& Sample)
        {
            return Sample.bSucceeded;
        });
}

float FQuestSupervisorProbeWindow::GetLatestRttMs() const
{
    for (int32 Index = CompletedSamples.Num() - 1; Index >= 0; --Index)
    {
        if (CompletedSamples[Index].bSucceeded)
        {
            return static_cast<float>(CompletedSamples[Index].RttMs);
        }
    }

    return 0.0f;
}

float FQuestSupervisorProbeWindow::GetPacketLossPct() const
{
    if (CompletedSamples.Num() == 0)
    {
        return 0.0f;
    }

    int32 LostSamples = 0;
    for (const FQuestSupervisorProbeSample& Sample : CompletedSamples)
    {
        if (!Sample.bSucceeded)
        {
            ++LostSamples;
        }
    }
    return static_cast<float>(LostSamples) * 100.0f / static_cast<float>(CompletedSamples.Num());
}

int32 FQuestSupervisorProbeWindow::GetCompletedSampleCount() const
{
    return CompletedSamples.Num();
}

int32 FQuestSupervisorProbeWindow::GetPendingProbeCount() const
{
    return PendingProbes.Num();
}

void FQuestSupervisorProbeWindow::AddCompletedSample(bool bSucceeded, double RttMs)
{
    FQuestSupervisorProbeSample Sample;
    Sample.bSucceeded = bSucceeded;
    Sample.RttMs = bSucceeded && FMath::IsFinite(RttMs) ? FMath::Max(0.0, RttMs) : 0.0;
    CompletedSamples.Add(Sample);

    if (CompletedSamples.Num() > MaximumSamples)
    {
        CompletedSamples.RemoveAt(0, CompletedSamples.Num() - MaximumSamples, EAllowShrinking::No);
    }
}

void FQuestSupervisorExperienceClock::Reset()
{
    ActiveRunId.Reset();
    StartedAtSeconds = 0.0;
    bActive = false;
}

bool FQuestSupervisorExperienceClock::ObserveLifecycle(
    const FString& Event,
    const FString& RunId,
    double ObservedAtSeconds)
{
    FString NormalizedEvent = Event.TrimStartAndEnd().ToLower();
    FString NormalizedRunId = RunId.TrimStartAndEnd();
    if (NormalizedRunId.IsEmpty() || !FMath::IsFinite(ObservedAtSeconds))
    {
        return false;
    }

    if (NormalizedEvent == TEXT("started"))
    {
        if (!bActive || ActiveRunId != NormalizedRunId)
        {
            ActiveRunId = NormalizedRunId;
            StartedAtSeconds = ObservedAtSeconds;
            bActive = true;
        }
        return true;
    }

    if (NormalizedEvent == TEXT("ended"))
    {
        if (bActive && ActiveRunId == NormalizedRunId)
        {
            Reset();
        }
        return true;
    }

    return false;
}

bool FQuestSupervisorExperienceClock::IsActive() const
{
    return bActive;
}

const FString& FQuestSupervisorExperienceClock::GetRunId() const
{
    return ActiveRunId;
}

float FQuestSupervisorExperienceClock::GetElapsedSeconds(double NowSeconds) const
{
    if (!bActive || !FMath::IsFinite(NowSeconds))
    {
        return 0.0f;
    }

    return static_cast<float>(FMath::Max(0.0, NowSeconds - StartedAtSeconds));
}

void FQuestSupervisorTelemetryState::Reset()
{
    FrameRate.Reset();
    Probes.Reset();
    Experience.Reset();
}

TSharedPtr<FJsonObject> QuestSupervisorTelemetryJson::BuildTelemetryObject(
    const FQuestSupervisorTelemetrySnapshot& Telemetry)
{
    TSharedPtr<FJsonObject> Object = MakeShared<FJsonObject>();
    Object->SetNumberField(TEXT("schemaVersion"), Telemetry.SchemaVersion);

    TSharedPtr<FJsonObject> ContextObject = MakeShared<FJsonObject>();
    ContextObject->SetStringField(TEXT("source"), Telemetry.Context.Source);
    ContextObject->SetStringField(TEXT("origin"), Telemetry.Context.Origin);
    ContextObject->SetStringField(TEXT("platform"), Telemetry.Context.Platform);
    ContextObject->SetStringField(TEXT("executionMode"), Telemetry.Context.ExecutionMode);
    Object->SetObjectField(TEXT("context"), ContextObject);

    TSharedPtr<FJsonObject> AvailabilityObject = MakeShared<FJsonObject>();
    for (const TPair<FString, FQuestSupervisorTelemetryMetricAvailability>& Pair : Telemetry.Availability)
    {
        TSharedPtr<FJsonObject> MetricObject = MakeShared<FJsonObject>();
        MetricObject->SetStringField(TEXT("status"), Pair.Value.Status);
        if (!Pair.Value.Source.IsEmpty())
        {
            MetricObject->SetStringField(TEXT("source"), Pair.Value.Source);
        }
        if (!Pair.Value.Reason.IsEmpty())
        {
            MetricObject->SetStringField(TEXT("reason"), Pair.Value.Reason);
        }
        AvailabilityObject->SetObjectField(Pair.Key, MetricObject);
    }
    Object->SetObjectField(TEXT("availability"), AvailabilityObject);

    Object->SetNumberField(TEXT("fps"), Telemetry.FPS);
    Object->SetNumberField(TEXT("latencyMs"), Telemetry.LatencyMs);
    Object->SetNumberField(TEXT("batteryPct"), Telemetry.BatteryPct);
    Object->SetNumberField(TEXT("cpuPct"), Telemetry.CpuPct);
    Object->SetNumberField(TEXT("gpuPct"), Telemetry.GpuPct);
    Object->SetNumberField(TEXT("memoryMb"), Telemetry.MemoryMb);
    Object->SetNumberField(TEXT("batteryTemperatureC"), Telemetry.BatteryTemperatureC);
    Object->SetNumberField(TEXT("temperatureC"), Telemetry.TemperatureC);
    Object->SetNumberField(TEXT("packetLossPct"), Telemetry.PacketLossPct);
    Object->SetNumberField(TEXT("supervisorUptimeSec"), Telemetry.SupervisorUptimeSec);
    Object->SetNumberField(TEXT("experienceElapsedSec"), Telemetry.ExperienceElapsedSec);
    Object->SetNumberField(TEXT("sessionElapsedSec"), Telemetry.SessionElapsedSec);
    return Object;
}
